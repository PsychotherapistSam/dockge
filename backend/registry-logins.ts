/*
 * Registry logins managed by Dockge.
 *
 * Dockge runs its own docker CLI (inside the container, for the official image), so logins made
 * with `docker login` on the host are invisible to it unless the host's docker config is mounted,
 * and even then only if they are stored inline (not in a credential helper like `pass`).
 *
 * To make private registries work out of the box, Dockge keeps its own docker config in
 * <dataDir>/docker and points DOCKER_CONFIG at it for every docker command it runs (and for the
 * image update checker). Sign-ins from Settings > Registries go through `docker login`, so the
 * CLI validates them and stores them exactly as it normally would.
 *
 * Logins found in the default config (~/.docker/config.json, e.g. a mounted host config) are
 * imported once, so existing setups keep working.
 *
 * If DOCKER_CONFIG is already set in the environment, Dockge uses that directory as it is.
 */
import fs from "fs";
import os from "os";
import path from "path";
import childProcessAsync from "promisify-child-process";
import { sync as commandExistsSync } from "command-exists";
import { log } from "./log";
import { LooseObject } from "../common/util-common";

const DOCKER_HUB_ADDRESS = "https://index.docker.io/v1/";
const HUB_ALIASES = [ "", "docker.io", "index.docker.io", "registry-1.docker.io", "hub.docker.com" ];
const IMPORTED_FILE = "imported-from-default-config.json";

export interface RegistryLogin {
    /** Address as stored in the docker config */
    server : string;
    /** Name to show, "Docker Hub" for the hub */
    registry : string;
    username : string;
}

function readJSON(file : string) : LooseObject | null {
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (e) {
        return null;
    }
}

function writePrivateJSON(file : string, data : object) {
    fs.writeFileSync(file, JSON.stringify(data, null, "\t") + "\n", { mode: 0o600 });
    try {
        fs.chmodSync(file, 0o600);
    } catch (e) {
        // Not supported on every filesystem
    }
}

/**
 * Normalise what a user types into a registry server for `docker login`.
 * Returns "" for Docker Hub. Throws on anything that is not a host[:port].
 */
export function normalizeRegistry(input : string) : string {
    let value = input.trim().toLowerCase();
    value = value.replace(/^[a-z]+:\/\//, "");
    value = value.replace(/\/.*$/, "");
    if (HUB_ALIASES.includes(value)) {
        return "";
    }
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/.test(value)) {
        throw new Error("Enter a registry host like ghcr.io or registry.example.com:5000");
    }
    return value;
}

function displayName(server : string) : string {
    const host = server.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
    return HUB_ALIASES.includes(host) ? "Docker Hub" : host;
}

export class RegistryLogins {
    /** Directory DOCKER_CONFIG points at */
    static dir = "";
    /** True when the directory came from the environment, not from Dockge */
    static external = false;

    static get configFile() : string {
        return path.join(this.dir, "config.json");
    }

    /**
     * Set up Dockge's docker config and point DOCKER_CONFIG at it.
     * Call once at startup, before any docker command runs.
     */
    static init(dataDir : string) {
        if (process.env.DOCKER_CONFIG) {
            this.dir = process.env.DOCKER_CONFIG;
            this.external = true;
            log.info("registry", `Using DOCKER_CONFIG from the environment: ${this.dir}`);
            return;
        }

        this.dir = path.resolve(dataDir, "docker");
        fs.mkdirSync(this.dir, { recursive: true,
            mode: 0o700 });

        const config : LooseObject = readJSON(this.configFile) ?? {};
        config.auths = config.auths ?? {};

        // Import logins from the default location once each
        const defaultFile = path.join(os.homedir(), ".docker", "config.json");
        const importedFile = path.join(this.dir, IMPORTED_FILE);
        const imported : string[] = readJSON(importedFile)?.servers ?? [];
        const source = path.resolve(defaultFile) !== path.resolve(this.configFile) ? readJSON(defaultFile) : null;
        let importedCount = 0;

        if (source) {
            for (const [ server, entry ] of Object.entries((source.auths ?? {}) as Record<string, LooseObject>)) {
                const hasSecret = entry && (entry.auth || entry.identitytoken);
                if (!hasSecret || imported.includes(server)) {
                    continue;
                }
                imported.push(server);
                if (!config.auths[server]) {
                    config.auths[server] = entry;
                    importedCount++;
                }
            }

            // Credential helpers only help if they are installed where Dockge runs
            const helperInstalled = (name : unknown) => typeof name === "string" && /^[a-zA-Z0-9._-]+$/.test(name) && commandExistsSync(`docker-credential-${name}`);
            if (!config.credsStore && helperInstalled(source.credsStore)) {
                config.credsStore = source.credsStore;
            }
            for (const [ server, helper ] of Object.entries((source.credHelpers ?? {}) as Record<string, string>)) {
                if (helperInstalled(helper)) {
                    config.credHelpers = config.credHelpers ?? {};
                    config.credHelpers[server] = config.credHelpers[server] ?? helper;
                }
            }
            writePrivateJSON(importedFile, { servers: imported });
        }

        writePrivateJSON(this.configFile, config);
        process.env.DOCKER_CONFIG = this.dir;
        log.info("registry", `Docker config: ${this.dir}` + (importedCount > 0 ? ` (imported ${importedCount} login(s) from ${defaultFile})` : ""));
    }

    /** Registries with a login stored in Dockge's docker config */
    static list() : { logins : RegistryLogin[], credsStore? : string, external : boolean, dir : string } {
        const config = readJSON(this.configFile) ?? {};
        const logins : RegistryLogin[] = [];
        for (const [ server, entry ] of Object.entries((config.auths ?? {}) as Record<string, LooseObject>)) {
            let username = "";
            if (typeof entry?.auth === "string" && entry.auth) {
                const decoded = Buffer.from(entry.auth, "base64").toString("utf-8");
                username = decoded.substring(0, decoded.indexOf(":"));
            } else if (entry?.identitytoken) {
                username = "token";
            } else if (!config.credsStore) {
                continue;
            }
            logins.push({
                server,
                registry: displayName(server),
                username,
            });
        }
        logins.sort((a, b) => a.registry.localeCompare(b.registry));
        return {
            logins,
            credsStore: config.credsStore,
            external: this.external,
            dir: this.dir,
        };
    }

    /**
     * `docker login` with the password on stdin, so it never shows up in a process list
     */
    static async login(registryInput : string, username : string, password : string) : Promise<string> {
        const server = normalizeRegistry(registryInput);
        if (!username.trim() || !password) {
            throw new Error("Username and password are required");
        }
        const args = [ "login", "--username", username.trim(), "--password-stdin" ];
        if (server) {
            args.push(server);
        }
        let res : string;
        try {
            res = await this.runDocker(args, password);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (/denied|unauthorized|incorrect username|401|403/i.test(message)) {
                throw new Error(`${server || "Docker Hub"} rejected the username or token`);
            }
            throw new Error(`Cannot sign in to ${server || "Docker Hub"}: ${message.replace(/^Error response from daemon: /, "")}`);
        }
        log.info("registry", `Signed in to ${server || "Docker Hub"} as ${username.trim()}`);
        return res;
    }

    static async logout(server : string) : Promise<void> {
        const name = displayName(server);
        const target = name === "Docker Hub" ? DOCKER_HUB_ADDRESS : server;
        try {
            await this.runDocker([ "logout", target ]);
        } catch (e) {
            // `docker logout` fails for entries it did not write, remove those directly
        }
        const config = readJSON(this.configFile);
        if (config?.auths?.[server]) {
            delete config.auths[server];
            writePrivateJSON(this.configFile, config);
        }
        log.info("registry", `Signed out of ${name}`);
    }

    protected static runDocker(args : string[], stdin? : string) : Promise<string> {
        return new Promise((resolve, reject) => {
            const child = childProcessAsync.spawn("docker", args, {
                env: { ...process.env,
                    DOCKER_CONFIG: this.dir },
                encoding: "utf-8",
            });
            if (stdin !== undefined) {
                child.stdin?.end(stdin);
            }
            child.then((res) => {
                resolve((res.stdout ?? "").toString().trim());
            }).catch((err) => {
                const stderr = (err.stderr ?? "").toString().trim();
                const message = stderr.split("\n").filter((line : string) => line && !line.startsWith("WARNING")).pop();
                reject(new Error(message || err.message));
            });
        });
    }
}
