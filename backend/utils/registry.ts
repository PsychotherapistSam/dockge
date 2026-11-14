/*
 * Minimal Docker Registry HTTP API v2 client and tag helpers, used by the image update checker.
 * Kept free of server imports so it can be tested on its own.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { LooseObject } from "../../common/util-common";

const DOCKER_HUB_REGISTRY = "registry-1.docker.io";
const REQUEST_TIMEOUT_MS = 15 * 1000;
const MAX_TAG_PAGES = 20;

const MANIFEST_ACCEPT = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
].join(", ");

export interface ImageRef {
    original : string;
    registry : string;
    repository : string;
    tag : string;
    digest? : string;
}

/**
 * Parse an image reference like `ghcr.io/owner/app:1.2@sha256:...` into its parts.
 * Follows the same normalisation rules as the docker CLI.
 */
export function parseImageRef(image : string) : ImageRef {
    let rest = image.trim();
    let digest : string | undefined;

    const at = rest.indexOf("@");
    if (at !== -1) {
        digest = rest.substring(at + 1);
        rest = rest.substring(0, at);
    }

    let tag = "";
    const lastColon = rest.lastIndexOf(":");
    if (lastColon > rest.lastIndexOf("/")) {
        tag = rest.substring(lastColon + 1);
        rest = rest.substring(0, lastColon);
    }

    let registry = DOCKER_HUB_REGISTRY;
    let repository = rest;
    const firstSlash = rest.indexOf("/");
    if (firstSlash !== -1) {
        const first = rest.substring(0, firstSlash);
        if (first.includes(".") || first.includes(":") || first === "localhost") {
            registry = first;
            repository = rest.substring(firstSlash + 1);
        }
    }

    if (registry === "docker.io" || registry === "index.docker.io") {
        registry = DOCKER_HUB_REGISTRY;
    }

    if (registry === DOCKER_HUB_REGISTRY && !repository.includes("/")) {
        repository = "library/" + repository;
    }

    if (!tag && !digest) {
        tag = "latest";
    }

    return {
        original: image,
        registry,
        repository,
        tag,
        digest,
    };
}

function tagNumbers(tag : string) : number[] {
    return (tag.match(/\d+/g) ?? []).map(Number);
}

function tagShape(tag : string) : string {
    return tag.replace(/\d+/g, "#");
}

function compareNumbers(a : number[], b : number[]) : number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return a.length - b.length;
}

export interface TagFilter {
    include? : RegExp[];
    exclude? : RegExp[];
}

/**
 * Find the tags that are newer than `current`, newest first.
 *
 * Without an include filter, a candidate must have the same "shape" as the current tag,
 * i.e. be identical once every run of digits is replaced: `1.2.3-alpine` matches
 * `1.10.0-alpine` but not `1.2.4` or `1.3`. Tags that do not start with a version number
 * (like `latest` or `stable`) only get the digest check.
 */
export function findNewerTags(current : string, allTags : string[], filter : TagFilter = {}) : string[] {
    const currentNumbers = tagNumbers(current);
    let candidates : string[];

    if (filter.include && filter.include.length > 0) {
        candidates = allTags.filter((t) => filter.include?.some((r) => r.test(t)));
    } else {
        if (!/^v?\d/.test(current)) {
            return [];
        }
        const shape = tagShape(current);
        candidates = allTags.filter((t) => tagShape(t) === shape);
    }

    if (filter.exclude && filter.exclude.length > 0) {
        candidates = candidates.filter((t) => !filter.exclude?.some((r) => r.test(t)));
    }

    if (currentNumbers.length > 0) {
        candidates = candidates.filter((t) => compareNumbers(tagNumbers(t), currentNumbers) > 0);
    }

    candidates = candidates.filter((t) => t !== current);
    return candidates.sort((a, b) => compareNumbers(tagNumbers(b), tagNumbers(a)) || b.localeCompare(a));
}

/**
 * Credentials from the docker CLI config (`docker login`). Credential helpers are not supported.
 */
function loadDockerAuths() : Record<string, string> {
    const dir = process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker");
    try {
        const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf-8"));
        const auths : Record<string, string> = {};
        for (const [ key, value ] of Object.entries(config.auths ?? {})) {
            const auth = (value as LooseObject)?.auth;
            if (typeof auth === "string" && auth) {
                auths[key] = auth;
            }
        }
        return auths;
    } catch (e) {
        return {};
    }
}

function findBasicAuth(auths : Record<string, string>, registry : string) : string | undefined {
    const keys = registry === DOCKER_HUB_REGISTRY
        ? [ "https://index.docker.io/v1/", "index.docker.io", "docker.io", "registry-1.docker.io" ]
        : [ registry, "https://" + registry, "http://" + registry, "https://" + registry + "/v1/", "https://" + registry + "/v2/" ];
    for (const key of keys) {
        if (auths[key]) {
            return auths[key];
        }
    }
    return undefined;
}

function parseChallenge(header : string) : { scheme : string, params : Record<string, string> } {
    const scheme = header.split(" ")[0].toLowerCase();
    const params : Record<string, string> = {};
    for (const match of header.matchAll(/(\w+)="([^"]*)"/g)) {
        params[match[1]] = match[2];
    }
    return { scheme,
        params };
}

/**
 * Minimal Docker Registry v2 client with anonymous / basic / bearer token auth.
 * One instance is used per check run, so tokens are cached for the run only.
 */
export class RegistryClient {
    protected authHeaders = new Map<string, string>();
    protected dockerAuths = loadDockerAuths();

    protected baseURL(registry : string) : string {
        // Plain HTTP is only assumed for localhost registries
        const insecure = registry.startsWith("localhost") || registry.startsWith("127.0.0.1");
        return (insecure ? "http://" : "https://") + registry;
    }

    protected async request(ref : ImageRef, url : string, init : RequestInit = {}) : Promise<Response> {
        const key = ref.registry + "/" + ref.repository;
        const doFetch = () => {
            const headers = new Headers(init.headers);
            const auth = this.authHeaders.get(key);
            if (auth) {
                headers.set("Authorization", auth);
            }
            return fetch(url, {
                ...init,
                headers,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        };

        let res = await doFetch();
        if (res.status !== 401 || this.authHeaders.has(key)) {
            return res;
        }

        const challenge = res.headers.get("www-authenticate");
        if (!challenge) {
            return res;
        }

        const { scheme, params } = parseChallenge(challenge);
        const basic = findBasicAuth(this.dockerAuths, ref.registry);

        if (scheme === "basic") {
            if (!basic) {
                return res;
            }
            this.authHeaders.set(key, "Basic " + basic);
        } else if (scheme === "bearer" && params.realm) {
            const tokenURL = new URL(params.realm);
            if (params.service) {
                tokenURL.searchParams.set("service", params.service);
            }
            tokenURL.searchParams.set("scope", params.scope || `repository:${ref.repository}:pull`);

            const tokenRes = await fetch(tokenURL, {
                headers: basic ? { Authorization: "Basic " + basic } : {},
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!tokenRes.ok) {
                throw new Error(`Registry auth failed (HTTP ${tokenRes.status})`);
            }
            const data = await tokenRes.json();
            const token = data.token || data.access_token;
            if (!token) {
                throw new Error("Registry auth returned no token");
            }
            this.authHeaders.set(key, "Bearer " + token);
        } else {
            return res;
        }

        // Drain the first response before retrying
        await res.body?.cancel();
        res = await doFetch();
        return res;
    }

    async getRemoteDigest(ref : ImageRef) : Promise<string> {
        const url = `${this.baseURL(ref.registry)}/v2/${ref.repository}/manifests/${ref.tag}`;
        const res = await this.request(ref, url, {
            method: "HEAD",
            headers: { Accept: MANIFEST_ACCEPT },
        });
        if (!res.ok) {
            throw new Error(`Cannot read manifest for ${ref.repository}:${ref.tag} (HTTP ${res.status})`);
        }
        const digest = res.headers.get("docker-content-digest");
        if (!digest) {
            throw new Error("Registry did not return a digest");
        }
        return digest;
    }

    async listTags(ref : ImageRef) : Promise<string[]> {
        const tags : string[] = [];
        let url : string | undefined = `${this.baseURL(ref.registry)}/v2/${ref.repository}/tags/list?n=1000`;

        for (let page = 0; url && page < MAX_TAG_PAGES; page++) {
            const res = await this.request(ref, url);
            if (!res.ok) {
                throw new Error(`Cannot list tags for ${ref.repository} (HTTP ${res.status})`);
            }
            const data = await res.json();
            if (Array.isArray(data.tags)) {
                tags.push(...data.tags);
            }

            const link = res.headers.get("link");
            const next = link?.match(/<([^>]+)>\s*;\s*rel="?next"?/);
            url = next ? new URL(next[1], url).toString() : undefined;
        }

        return tags;
    }
}
