/*
 * Docker cleanup: a preview of what `docker system prune --all` would remove, and the prune itself,
 * split into groups that can be switched on and off.
 *
 * Prune order matters and matches `docker system prune`: stopped containers go first, which can
 * leave their networks and images unused, so those are evaluated as if the containers were gone.
 */
import childProcessAsync from "promisify-child-process";
import { log } from "./log";

export type ImageMode = "none" | "dangling" | "all";

export interface CleanupOptions {
    containers : boolean;
    networks : boolean;
    images : ImageMode;
    buildCache : boolean;
    volumes : boolean;
}

export interface CleanupContainer {
    id : string;
    name : string;
    image : string;
    state : string;
    status : string;
    stack : string;
}

export interface CleanupNetwork {
    id : string;
    name : string;
    stack : string;
}

export interface CleanupImage {
    id : string;
    tags : string[];
    size : number;
    /** Space only this image uses, what removing it frees */
    uniqueSize : number;
    created : string;
    dangling : boolean;
    /** Used only by stopped containers, unused once those are pruned */
    stoppedOnly : boolean;
    stacks : string[];
}

export interface CleanupVolume {
    name : string;
    size : number;
    /** Used only by stopped containers, unused once those are pruned */
    stoppedOnly : boolean;
    stacks : string[];
}

export interface CleanupPreview {
    containers : CleanupContainer[];
    networks : CleanupNetwork[];
    images : CleanupImage[];
    buildCache : { count : number, size : number, reclaimable : number };
    volumes : CleanupVolume[];
    /** Anonymous volume pruning is only safe on Docker 23+, where `volume prune` keeps named volumes */
    volumesSupported : boolean;
    dockerVersion : string;
}

export interface PruneStep {
    group : string;
    reclaimed : number;
    output : string;
}

async function docker(args : string[]) : Promise<string> {
    try {
        const res = await childProcessAsync.spawn("docker", args, {
            encoding: "utf-8",
            maxBuffer: 64 * 1024 * 1024,
        });
        return (res.stdout ?? "").toString();
    } catch (e) {
        const err = e as { stderr? : string | Buffer, message : string };
        const stderr = (err.stderr ?? "").toString().trim();
        throw new Error(stderr.split("\n").filter((l) => l.trim()).pop() || err.message);
    }
}

function jsonLines<T>(out : string) : T[] {
    return out.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l));
}

function labelValue(labels : string, key : string) : string {
    for (const pair of (labels || "").split(",")) {
        const eq = pair.indexOf("=");
        if (eq !== -1 && pair.substring(0, eq) === key) {
            return pair.substring(eq + 1);
        }
    }
    return "";
}

/** "1.2GB", "512kB", "0B" (decimal units, as Docker prints them) to bytes */
export function parseDockerSize(text : string) : number {
    const m = (text || "").trim().match(/^([\d.]+)\s*([kKMGTP]?)B/);
    if (!m) {
        return 0;
    }
    const factor : Record<string, number> = { "": 1,
        k: 1e3,
        K: 1e3,
        M: 1e6,
        G: 1e9,
        T: 1e12,
        P: 1e15 };
    return Math.round(Number(m[1]) * (factor[m[2]] ?? 1));
}

const STOPPED_STATES = [ "exited", "created", "dead" ];

export class DockerCleanup {
    static running = false;

    static async preview(options : Pick<CleanupOptions, "containers"> = { containers: true }) : Promise<CleanupPreview> {
        // Containers
        const allContainers = jsonLines<Record<string, string>>(await docker([ "ps", "-a", "--no-trunc", "--format", "{{json .}}" ]));
        const stopped = allContainers.filter((c) => STOPPED_STATES.includes(c.State));
        const containers : CleanupContainer[] = stopped.map((c) => ({
            id: c.ID,
            name: c.Names,
            image: c.Image,
            state: c.State,
            status: c.Status,
            stack: labelValue(c.Labels, "com.docker.compose.project"),
        }));

        // Image IDs that stay in use: running containers, plus stopped ones if those are kept
        const keepContainers = options.containers ? allContainers.filter((c) => !STOPPED_STATES.includes(c.State)) : allContainers;
        const imageOf = new Map<string, string>();
        if (allContainers.length > 0) {
            const lines = (await docker([ "inspect", "--format", "{{.Id}} {{.Image}}", ...allContainers.map((c) => c.ID) ])).split("\n");
            for (const line of lines) {
                const [ id, image ] = line.trim().split(" ");
                if (id && image) {
                    imageOf.set(id, image);
                }
            }
        }
        const usedImages = new Set(keepContainers.map((c) => imageOf.get(c.ID)).filter(Boolean) as string[]);
        const stoppedImageStacks = new Map<string, Set<string>>();
        for (const c of stopped) {
            const image = imageOf.get(c.ID);
            if (image) {
                const set = stoppedImageStacks.get(image) ?? new Set<string>();
                const stack = labelValue(c.Labels, "com.docker.compose.project");
                if (stack) {
                    set.add(stack);
                }
                stoppedImageStacks.set(image, set);
            }
        }

        // Images
        const imageRows = jsonLines<Record<string, string>>(await docker([ "image", "ls", "--no-trunc", "--format", "{{json .}}" ]));
        const byId = new Map<string, CleanupImage>();
        for (const row of imageRows) {
            const dangling = row.Repository === "<none>";
            let image = byId.get(row.ID);
            if (!image) {
                image = {
                    id: row.ID,
                    tags: [],
                    size: 0,
                    uniqueSize: 0,
                    created: row.CreatedAt,
                    dangling,
                    stoppedOnly: false,
                    stacks: [],
                };
                byId.set(row.ID, image);
            }
            if (!dangling) {
                image.tags.push(row.Tag && row.Tag !== "<none>" ? `${row.Repository}:${row.Tag}` : row.Repository);
                image.dangling = false;
            }
        }
        const candidates = [ ...byId.values() ].filter((i) => !usedImages.has(i.id));
        if (candidates.length > 0) {
            for (const line of (await docker([ "image", "inspect", "--format", "{{.Id}} {{.Size}}", ...candidates.map((i) => i.id) ])).split("\n")) {
                const [ id, size ] = line.trim().split(" ");
                const image = byId.get(id);
                if (image) {
                    image.size = Number(size) || 0;
                }
            }
        }

        // Unique sizes, volume sizes and build cache from Docker's own accounting
        let buildCache = { count: 0,
            size: 0,
            reclaimable: 0 };
        const volumeSizes = new Map<string, number>();
        try {
            for (const row of jsonLines<Record<string, string>>(await docker([ "system", "df", "--format", "{{json .}}" ]))) {
                if (row.Type === "Build Cache") {
                    buildCache = { count: Number(row.TotalCount) || 0,
                        size: parseDockerSize(row.Size),
                        reclaimable: parseDockerSize(row.Reclaimable) };
                }
            }
            const verbose = JSON.parse(await docker([ "system", "df", "-v", "--format", "{{json .}}" ]));
            for (const row of (verbose.Images ?? []) as Record<string, string>[]) {
                const image = [ ...byId.values() ].find((i) => i.id.endsWith(row.ID.replace(/^sha256:/, "")) || i.id === row.ID);
                if (image) {
                    image.uniqueSize = parseDockerSize(row.UniqueSize);
                }
            }
            for (const row of (verbose.Volumes ?? []) as Record<string, string>[]) {
                volumeSizes.set(row.Name, parseDockerSize(row.Size));
            }
        } catch (e) {
            log.debug("cleanup", `docker system df failed: ${e}`);
        }
        for (const image of candidates) {
            if (!image.uniqueSize) {
                image.uniqueSize = image.size;
            }
            const stacks = stoppedImageStacks.get(image.id);
            if (stacks) {
                image.stoppedOnly = true;
                image.stacks = [ ...stacks ];
            }
        }

        // Networks with no connected containers (stopped containers hold no endpoints)
        const networkRows = jsonLines<Record<string, string>>(await docker([ "network", "ls", "--no-trunc", "--filter", "type=custom", "--format", "{{json .}}" ]));
        const networks : CleanupNetwork[] = [];
        if (networkRows.length > 0) {
            const counts = (await docker([ "network", "inspect", "--format", "{{.Id}} {{len .Containers}}", ...networkRows.map((n) => n.ID) ])).split("\n");
            const inUse = new Set(counts.map((l) => l.trim().split(" ")).filter(([ , n ]) => Number(n) > 0).map(([ id ]) => id));
            for (const n of networkRows) {
                if (!inUse.has(n.ID)) {
                    networks.push({ id: n.ID,
                        name: n.Name,
                        stack: labelValue(n.Labels, "com.docker.compose.project") });
                }
            }
        }

        // Unused anonymous volumes, only offered where `volume prune` leaves named ones alone.
        // Like images, volumes of stopped containers count as unused once those containers are pruned.
        const dockerVersion = (await docker([ "version", "--format", "{{.Server.Version}}" ])).trim();
        const volumesSupported = Number(dockerVersion.split(".")[0]) >= 23;
        const volumes : CleanupVolume[] = [];
        if (volumesSupported) {
            const mountedBy = new Map<string, string[]>();
            if (allContainers.length > 0) {
                const format = "{{.Id}}|{{range .Mounts}}{{if eq .Type \"volume\"}}{{.Name}},{{end}}{{end}}";
                for (const line of (await docker([ "inspect", "--format", format, ...allContainers.map((c) => c.ID) ])).split("\n")) {
                    const [ id, names ] = line.trim().split("|");
                    for (const name of (names ?? "").split(",").filter(Boolean)) {
                        mountedBy.set(name, [ ...(mountedBy.get(name) ?? []), id ]);
                    }
                }
            }
            const keepIds = new Set(keepContainers.map((c) => c.ID));
            const stoppedById = new Map(stopped.map((c) => [ c.ID, c ]));
            for (const v of jsonLines<Record<string, string>>(await docker([ "volume", "ls", "--filter", "label=com.docker.volume.anonymous", "--format", "{{json .}}" ]))) {
                const users = mountedBy.get(v.Name) ?? [];
                if (users.some((id) => keepIds.has(id))) {
                    continue;
                }
                const stacks = new Set(users.map((id) => labelValue(stoppedById.get(id)?.Labels ?? "", "com.docker.compose.project")).filter(Boolean));
                volumes.push({
                    name: v.Name,
                    size: volumeSizes.get(v.Name) ?? 0,
                    stoppedOnly: users.length > 0,
                    stacks: [ ...stacks ],
                });
            }
        }

        return {
            containers,
            networks,
            images: candidates.sort((a, b) => b.uniqueSize - a.uniqueSize),
            buildCache,
            volumes,
            volumesSupported,
            dockerVersion,
        };
    }

    /**
     * Run the selected prunes in `docker system prune` order and report what each freed
     */
    static async prune(options : CleanupOptions) : Promise<PruneStep[]> {
        if (this.running) {
            throw new Error("A cleanup is already running");
        }
        this.running = true;
        const steps : PruneStep[] = [];
        const run = async (group : string, args : string[]) => {
            const output = await docker(args);
            const match = output.match(/Total reclaimed space:\s*(.+)/i);
            steps.push({ group,
                reclaimed: match ? parseDockerSize(match[1]) : 0,
                output: output.trim() });
        };
        try {
            if (options.containers) {
                await run("containers", [ "container", "prune", "--force" ]);
            }
            if (options.networks) {
                await run("networks", [ "network", "prune", "--force" ]);
            }
            if (options.images === "dangling") {
                await run("images", [ "image", "prune", "--force" ]);
            } else if (options.images === "all") {
                await run("images", [ "image", "prune", "--all", "--force" ]);
            }
            if (options.buildCache) {
                await run("buildCache", [ "builder", "prune", "--force", ...(options.images === "all" ? [ "--all" ] : []) ]);
            }
            if (options.volumes) {
                const version = (await docker([ "version", "--format", "{{.Server.Version}}" ])).trim();
                if (Number(version.split(".")[0]) < 23) {
                    throw new Error("Pruning volumes needs Docker 23 or newer, older versions would also remove named volumes");
                }
                await run("volumes", [ "volume", "prune", "--force" ]);
            }
            log.info("cleanup", "Pruned: " + steps.map((s) => `${s.group} ${s.reclaimed} B`).join(", "));
            return steps;
        } finally {
            this.running = false;
        }
    }
}
