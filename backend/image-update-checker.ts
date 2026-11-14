/*
 * Image update checker
 *
 * For every service in every stack, this checks the image's registry for:
 *   1. A new digest behind the tag the service uses (e.g. `latest` or `1` was re-pushed)
 *   2. Newer tags of the same form as the current tag (e.g. `1.2.3-alpine` -> `1.2.4-alpine`)
 *
 * It talks to the registry over the Docker Registry HTTP API v2, so nothing is pulled.
 * Manifest HEAD requests and tag listings do not count towards Docker Hub's pull rate limit.
 *
 * Per-service behaviour can be tuned with compose labels (the diun.* names are accepted too,
 * to make migrating from diun easy):
 *   dockge.update.enable=false              skip this service
 *   dockge.update.watch_tags=true           also list newer tags (diun.watch_repo); the default comes from settings
 *   dockge.update.include_tags=^\d+\.\d+$   only tags matching one of these regexes (`;`-separated)
 *   dockge.update.exclude_tags=rc;beta      ignore tags matching one of these regexes (`;`-separated)
 */
import childProcessAsync from "promisify-child-process";
import { log } from "./log";
import { Settings } from "./settings";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";
import { LooseObject } from "../common/util-common";
import { parseImageRef, RegistryClient, TagFilter, findNewerTags } from "./utils/registry";

const DEFAULT_INTERVAL_HOURS = 6;
const FIRST_CHECK_DELAY_MS = 30 * 1000;
const MAX_NEW_TAGS = 50;
const CONCURRENCY = 4;

export type ServiceUpdateStatus = "up-to-date" | "update-available" | "skipped" | "error";

export interface ServiceUpdateInfo {
    service : string;
    image : string;
    status : ServiceUpdateStatus;
    /** The tag the service uses now points to a different image than the local one */
    digestUpdate : boolean;
    /** Newer tags of the same form, newest first */
    newTags : string[];
    /** Number of newer tags found, can be more than newTags.length */
    newTagCount : number;
    localDigest? : string;
    remoteDigest? : string;
    message? : string;
    checkedAt : number;
}

export interface StackUpdateInfo {
    stackName : string;
    checkedAt : number;
    updateCount : number;
    error? : string;
    services : Record<string, ServiceUpdateInfo>;
}

/**
 * Digests the local image is known by, e.g. `nginx@sha256:...`. Empty if the image
 * was never pulled (or was built locally).
 */
async function getLocalDigests(image : string) : Promise<string[] | null> {
    try {
        const res = await childProcessAsync.spawn("docker", [ "image", "inspect", "--format", "{{json .RepoDigests}}", image ], {
            encoding: "utf-8",
        });
        const list = JSON.parse(res.stdout?.toString().trim() || "[]");
        if (!Array.isArray(list)) {
            return [];
        }
        return list.map((d : string) => d.substring(d.indexOf("@") + 1));
    } catch (e) {
        // Image not present locally
        return null;
    }
}

function getLabels(service : LooseObject) : Record<string, string> {
    const labels : Record<string, string> = {};
    if (Array.isArray(service.labels)) {
        for (const item of service.labels) {
            const [ key, ...value ] = String(item).split("=");
            labels[key] = value.join("=");
        }
    } else if (service.labels && typeof service.labels === "object") {
        for (const [ key, value ] of Object.entries(service.labels)) {
            labels[key] = String(value);
        }
    }
    return labels;
}

function getLabel(labels : Record<string, string>, name : string) : string | undefined {
    // `docker compose config` escapes a literal `$` as `$$` in its output
    return (labels["dockge.update." + name] ?? labels["diun." + name])?.replace(/\$\$/g, "$");
}

function parseRegexList(value : string | undefined) : RegExp[] | undefined {
    if (!value) {
        return undefined;
    }
    return value.split(";").map((s) => s.trim()).filter((s) => s).map((s) => new RegExp(s));
}

async function runPool<T>(items : T[], worker : (item : T) => Promise<void>) {
    const queue = [ ...items ];
    const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
            const item = queue.shift() as T;
            await worker(item);
        }
    });
    await Promise.all(runners);
}

interface ImageResult {
    digestUpdate : boolean;
    newTags : string[];
    localDigest? : string;
    remoteDigest? : string;
    message? : string;
    error? : string;
}

export class ImageUpdateChecker {
    static results = new Map<string, StackUpdateInfo>();
    static checking = false;
    static lastRunAt? : number;
    protected static timer? : NodeJS.Timeout;
    protected static server? : DockgeServer;

    static async isEnabled() : Promise<boolean> {
        return (await Settings.get("imageUpdateCheck")) !== false;
    }

    static async getIntervalMs() : Promise<number> {
        const hours = Number(await Settings.get("imageUpdateCheckInterval"));
        const safeHours = Number.isFinite(hours) && hours >= 0.25 ? hours : DEFAULT_INTERVAL_HOURS;
        return safeHours * 60 * 60 * 1000;
    }

    /**
     * Start the periodic check. The first run happens shortly after startup.
     */
    static start(server : DockgeServer) {
        this.server = server;
        this.schedule(FIRST_CHECK_DELAY_MS);
    }

    /**
     * Re-read the interval setting, e.g. after the settings were saved
     */
    static async reschedule() {
        if (!this.server) {
            return;
        }
        const interval = await this.getIntervalMs();
        const sinceLast = this.lastRunAt ? Date.now() - this.lastRunAt : interval;
        this.schedule(Math.max(FIRST_CHECK_DELAY_MS, interval - sinceLast));
    }

    protected static schedule(delay : number) {
        clearTimeout(this.timer);
        this.timer = setTimeout(async () => {
            try {
                if (this.server && await this.isEnabled()) {
                    await this.checkAll(this.server);
                }
            } catch (e) {
                log.error("image-update", e);
            }
            this.schedule(await this.getIntervalMs());
        }, delay);
        this.timer.unref?.();
    }

    static stop() {
        clearTimeout(this.timer);
    }

    static getStackUpdateCount(stackName : string) : number {
        return this.results.get(stackName)?.updateCount ?? 0;
    }

    /**
     * After a successful `docker compose pull`, the local images match the registry again,
     * so clear the digest flags right away instead of waiting for the re-check.
     */
    static markPulled(server : DockgeServer, stackName : string) {
        const info = this.results.get(stackName);
        if (!info) {
            return;
        }
        info.updateCount = 0;
        for (const service of Object.values(info.services)) {
            if (service.digestUpdate) {
                service.digestUpdate = false;
                service.localDigest = service.remoteDigest;
            }
            if (service.status === "update-available") {
                service.status = service.newTags.length > 0 ? "update-available" : "up-to-date";
            }
            if (service.status === "update-available") {
                info.updateCount++;
            }
        }
        server.sendStackList(true);
    }

    /**
     * Check every stack. Images shared between stacks are only checked once.
     */
    static checkAll(server : DockgeServer) : Promise<void> {
        // If a run is in progress, wait for that one instead of starting another
        if (!this.currentRun) {
            this.currentRun = this.runAll(server).finally(() => {
                this.currentRun = undefined;
            });
        }
        return this.currentRun;
    }

    protected static currentRun? : Promise<void>;

    protected static async runAll(server : DockgeServer) {
        this.checking = true;
        this.lastRunAt = Date.now();
        log.info("image-update", "Checking for image updates");

        try {
            const stackList = await Stack.getStackList(server, true);
            const client = new RegistryClient();
            const imageCache = new Map<string, Promise<ImageResult>>();
            const newResults = new Map<string, StackUpdateInfo>();

            await runPool([ ...stackList.values() ], async (stack) => {
                newResults.set(stack.name, await this.checkStackWith(stack, client, imageCache));
            });

            this.results = newResults;
            const total = [ ...newResults.values() ].reduce((sum, r) => sum + r.updateCount, 0);
            log.info("image-update", `Image update check finished, ${total} service(s) with updates`);
        } finally {
            this.checking = false;
        }

        server.sendStackList(true);
    }

    static async checkStack(server : DockgeServer, stack : Stack) : Promise<StackUpdateInfo> {
        const result = await this.checkStackWith(stack, new RegistryClient(), new Map());
        this.results.set(stack.name, result);
        server.sendStackList(true);
        return result;
    }

    protected static async checkStackWith(stack : Stack, client : RegistryClient, imageCache : Map<string, Promise<ImageResult>>) : Promise<StackUpdateInfo> {
        const checkedAt = Date.now();
        const watchTagsByDefault = (await Settings.get("imageUpdateWatchTags")) === true;
        const info : StackUpdateInfo = {
            stackName: stack.name,
            checkedAt,
            updateCount: 0,
            services: {},
        };

        let config : LooseObject | null;
        try {
            config = await stack.getResolvedConfig();
        } catch (e) {
            info.error = e instanceof Error ? e.message : String(e);
            return info;
        }

        for (const [ serviceName, service ] of Object.entries((config?.services ?? {}) as Record<string, LooseObject>)) {
            const base = {
                service: serviceName,
                image: service.image ?? "",
                digestUpdate: false,
                newTags: [] as string[],
                newTagCount: 0,
                checkedAt,
            };

            const skip = (message : string) : ServiceUpdateInfo => ({ ...base,
                status: "skipped",
                message });

            if (!service.image) {
                info.services[serviceName] = skip("No image (built locally)");
                continue;
            }
            if (service.build) {
                info.services[serviceName] = skip("Image is built locally");
                continue;
            }

            const labels = getLabels(service);
            if (getLabel(labels, "enable")?.toLowerCase() === "false") {
                info.services[serviceName] = skip("Disabled by label");
                continue;
            }

            let filter : TagFilter;
            try {
                filter = {
                    include: parseRegexList(getLabel(labels, "include_tags")),
                    exclude: parseRegexList(getLabel(labels, "exclude_tags")),
                };
            } catch (e) {
                info.services[serviceName] = { ...base,
                    status: "error",
                    message: "Invalid tag regex: " + (e instanceof Error ? e.message : e) };
                continue;
            }

            // Listing newer tags is opt-in: label first, then the global setting
            const watchLabel = (labels["dockge.update.watch_tags"] ?? labels["diun.watch_repo"])?.toLowerCase();
            const watchTags = watchLabel !== undefined ? watchLabel === "true" : watchTagsByDefault;

            const cacheKey = [ service.image, watchTags, getLabel(labels, "include_tags") ?? "", getLabel(labels, "exclude_tags") ?? "" ].join("|");
            let promise = imageCache.get(cacheKey);
            if (!promise) {
                promise = this.checkImage(service.image, filter, watchTags, client);
                imageCache.set(cacheKey, promise);
            }
            const result = await promise;

            const hasUpdate = result.digestUpdate || result.newTags.length > 0;
            info.services[serviceName] = {
                ...base,
                status: result.error ? "error" : (hasUpdate ? "update-available" : "up-to-date"),
                digestUpdate: result.digestUpdate,
                newTags: result.newTags.slice(0, MAX_NEW_TAGS),
                newTagCount: result.newTags.length,
                localDigest: result.localDigest,
                remoteDigest: result.remoteDigest,
                message: result.error ?? result.message,
            };
            if (hasUpdate) {
                info.updateCount++;
            }
        }

        return info;
    }

    protected static async checkImage(image : string, filter : TagFilter, watchTags : boolean, client : RegistryClient) : Promise<ImageResult> {
        const result : ImageResult = {
            digestUpdate: false,
            newTags: [],
        };

        try {
            const ref = parseImageRef(image);
            const errors : string[] = [];

            // 1. Digest check, only for images referenced by tag
            if (!ref.digest) {
                try {
                    const [ remote, local ] = await Promise.all([ client.getRemoteDigest(ref), getLocalDigests(image) ]);
                    result.remoteDigest = remote;
                    if (local === null) {
                        result.message = "Image not pulled yet";
                    } else if (local.length === 0) {
                        result.message = "Local image has no registry digest";
                    } else {
                        result.localDigest = local[0];
                        result.digestUpdate = !local.includes(remote);
                    }
                } catch (e) {
                    errors.push(e instanceof Error ? e.message : String(e));
                }
            } else {
                result.message = "Pinned to a digest";
            }

            // 2. Newer tags
            if (watchTags && ref.tag && (filter.include || /^v?\d/.test(ref.tag))) {
                try {
                    result.newTags = findNewerTags(ref.tag, await client.listTags(ref), filter);
                } catch (e) {
                    errors.push(e instanceof Error ? e.message : String(e));
                }
            }

            if (errors.length > 0) {
                result.error = errors.join("; ");
            }
        } catch (e) {
            result.error = e instanceof Error ? e.message : String(e);
        }

        if (result.error) {
            log.debug("image-update", `${image}: ${result.error}`);
        }
        return result;
    }
}
