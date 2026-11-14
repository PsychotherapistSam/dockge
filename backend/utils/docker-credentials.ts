/*
 * Registry credentials, resolved the same way the docker CLI does:
 *   1. a per-registry credential helper (`credHelpers` in config.json)
 *   2. the default credential helper (`credsStore`, e.g. "desktop", "pass", "secretservice", "osxkeychain")
 *   3. logins stored inline in config.json (`auths.<server>.auth`, `identitytoken`)
 *
 * The config is read from $DOCKER_CONFIG/config.json or ~/.docker/config.json.
 * In the Dockge container that is /root/.docker, so mount the host's docker config there,
 * and make sure any credential helper it names is installed in the container too.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { LooseObject } from "../../common/util-common";

const DOCKER_HUB_REGISTRY = "registry-1.docker.io";
const HELPER_TIMEOUT_MS = 10 * 1000;

export interface RegistryCredentials {
    username? : string;
    password? : string;
    /** OAuth2 refresh token (`identitytoken`), used instead of a password by e.g. Azure ACR */
    identityToken? : string;
    /** Where the credentials came from, for messages */
    source : string;
}

interface DockerConfigFile {
    auths? : Record<string, LooseObject>;
    credsStore? : string;
    credHelpers? : Record<string, string>;
}

export function dockerConfigDir() : string {
    return process.env.DOCKER_CONFIG || path.join(os.homedir(), ".docker");
}

/**
 * Server address spellings to look up, most likely first. The CLI stores Docker Hub
 * under its legacy index URL and every other registry under its host name.
 */
export function serverAddresses(registry : string) : string[] {
    if (registry === DOCKER_HUB_REGISTRY) {
        return [ "https://index.docker.io/v1/", "index.docker.io", "docker.io", "registry-1.docker.io", "https://registry-1.docker.io" ];
    }
    return [ registry, "https://" + registry, "http://" + registry, "https://" + registry + "/v1/", "https://" + registry + "/v2/" ];
}

/**
 * Run `docker-credential-<helper> get` for one server address.
 * Resolves to undefined when the helper has no credentials for it.
 * Rejects with code ENOENT when the helper is not installed.
 */
function runHelper(helper : string, serverAddress : string) : Promise<{ Username? : string, Secret? : string } | undefined> {
    return new Promise((resolve, reject) => {
        const child = spawn(`docker-credential-${helper}`, [ "get" ], {
            stdio: [ "pipe", "pipe", "pipe" ],
            windowsHide: true,
        });
        let stdout = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`docker-credential-${helper} timed out`));
        }, HELPER_TIMEOUT_MS);

        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                // "credentials not found in native keychain" and similar
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                resolve(undefined);
            }
        });
        child.stdin.end(serverAddress);
    });
}

export class DockerCredentials {
    protected config : DockerConfigFile;
    protected cache = new Map<string, Promise<RegistryCredentials | undefined>>();
    protected missingHelpers = new Set<string>();

    constructor(configDir = dockerConfigDir()) {
        try {
            this.config = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"));
        } catch (e) {
            this.config = {};
        }
    }

    /** Credential helpers named by the config that are not installed here */
    get unavailableHelpers() : string[] {
        return [ ...this.missingHelpers ];
    }

    get(registry : string) : Promise<RegistryCredentials | undefined> {
        let promise = this.cache.get(registry);
        if (!promise) {
            promise = this.resolve(registry);
            this.cache.set(registry, promise);
        }
        return promise;
    }

    protected helperFor(addresses : string[]) : string | undefined {
        const helpers = this.config.credHelpers ?? {};
        for (const address of addresses) {
            if (helpers[address]) {
                return helpers[address];
            }
        }
        return this.config.credsStore || undefined;
    }

    protected async resolve(registry : string) : Promise<RegistryCredentials | undefined> {
        const addresses = serverAddresses(registry);

        // 1 + 2: credential helper
        const helper = this.helperFor(addresses);
        if (helper && /^[a-zA-Z0-9._-]+$/.test(helper) && !this.missingHelpers.has(helper)) {
            for (const address of addresses) {
                let result;
                try {
                    result = await runHelper(helper, address);
                } catch (e) {
                    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                        this.missingHelpers.add(helper);
                    }
                    break;
                }
                if (result?.Secret) {
                    const source = `docker-credential-${helper}`;
                    if (result.Username === "<token>") {
                        return { identityToken: result.Secret,
                            source };
                    }
                    return { username: result.Username ?? "",
                        password: result.Secret,
                        source };
                }
            }
        }

        // 3: inline logins in config.json (the CLI falls back to these too)
        const auths = this.config.auths ?? {};
        for (const address of addresses) {
            const entry = auths[address];
            if (!entry) {
                continue;
            }
            const source = "config.json";
            if (typeof entry.identitytoken === "string" && entry.identitytoken) {
                return { identityToken: entry.identitytoken,
                    source };
            }
            if (typeof entry.auth === "string" && entry.auth) {
                const decoded = Buffer.from(entry.auth, "base64").toString("utf-8");
                const colon = decoded.indexOf(":");
                if (colon !== -1) {
                    return { username: decoded.substring(0, colon),
                        password: decoded.substring(colon + 1),
                        source };
                }
            }
            if (typeof entry.username === "string" && typeof entry.password === "string") {
                return { username: entry.username,
                    password: entry.password,
                    source };
            }
        }

        return undefined;
    }
}
