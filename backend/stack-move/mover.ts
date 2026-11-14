/*
 * The sending side of a stack move.
 *
 *   check: inspect the stack here, run the pre-flight checks on the target
 *   move:  stop -> pack folder + named volumes -> send -> target unpacks (and starts) -> mark
 *
 * If anything fails after the stack was stopped, the target rolls back what it created and the
 * stack is started here again. On success the stopped copy stays here (marked as moved) until
 * it is removed explicitly.
 */
import fs, { promises as fsAsync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Socket } from "socket.io-client";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { log } from "../log";
import { LinkedServer, LinkedServers } from "./links";
import { exportVolume, packFolder, run, sha256File } from "./archive";
import { inspectStack, StackInspection } from "./inspect";
import { formatBytes, ManifestFile, MOVE_DIR, PreflightResult } from "./receiver";

const CHUNK_SIZE = 512 * 1024;
const WINDOW = 8;
const ACK_TIMEOUT_MS = 60 * 1000;
const FINISH_TIMEOUT_MS = 60 * 60 * 1000;
export const MOVED_MARKER = ".dockge-moved.json";

export type MovePhase = "stop" | "pack" | "transfer" | "unpack" | "start" | "rollback" | "done" | "failed";

export interface MoveProgress {
    stackName : string;
    phase : MovePhase;
    message? : string;
    /** 0-100 for the transfer */
    percent? : number;
    sentBytes? : number;
    totalBytes? : number;
    target? : string;
    targetURL? : string;
}

export interface MoveCheck {
    source : StackInspection;
    target : PreflightResult & { name : string, url : string };
    problems : string[];
    warnings : string[];
}

export interface MovedMarker {
    linkId : string;
    name : string;
    url : string;
    at : number;
    /** Named volumes that were moved, removed together with the stopped copy */
    volumes : string[];
}

/** Rough size estimate for the pre-flight space check, without packing anything */
async function estimateBytes(stack : Stack, inspection : StackInspection) : Promise<number> {
    let total = 0;
    const walk = async (dir : string) => {
        for (const entry of await fsAsync.readdir(dir, { withFileTypes: true }).catch(() => [])) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile()) {
                total += (await fsAsync.stat(full).catch(() => ({ size: 0 }))).size;
            }
        }
    };
    await walk(stack.fullPath);
    if (inspection.volumes.length > 0) {
        try {
            const out = await run("docker", [ "system", "df", "-v", "--format", "{{json .Volumes}}" ]);
            const list = JSON.parse(out) as { Name : string, Size : string }[];
            for (const volume of inspection.volumes) {
                total += parseSize(list.find((v) => v.Name === volume.name)?.Size ?? "0");
            }
        } catch (e) {
            // Unknown, the receiver still checks free space against this estimate
        }
    }
    return total;
}

function parseSize(text : string) : number {
    const m = text.trim().match(/^([\d.]+)\s*([KMGT]?)B$/i);
    if (!m) {
        return 0;
    }
    const factor = { "": 1,
        K: 1e3,
        M: 1e6,
        G: 1e9,
        T: 1e12 }[m[2].toUpperCase() as "" | "K" | "M" | "G" | "T"];
    return Number(m[1]) * factor;
}

async function ask<T>(client : Socket, timeout : number, event : string, ...args : unknown[]) : Promise<T> {
    let res;
    try {
        res = await client.timeout(timeout).emitWithAck(event, ...args);
    } catch (e) {
        throw new Error(event === "move:hello" || event === "move:preflight"
            ? "The other server does not support moving stacks, update it to this Dockge version"
            : "The other server stopped answering");
    }
    if (!res?.ok) {
        throw new Error(res?.msg || "The other server reported an error");
    }
    return res as T;
}

export function readMovedMarker(stack : Stack) : MovedMarker | null {
    try {
        return JSON.parse(fs.readFileSync(path.join(stack.path, MOVED_MARKER), "utf-8"));
    } catch (e) {
        return null;
    }
}

export class StackMover {
    static active = new Set<string>();

    static async check(server : DockgeServer, stackName : string, linkId : string) : Promise<MoveCheck> {
        const stack = await Stack.getStack(server, stackName);
        const source = await inspectStack(stack);
        const { link, client } = await LinkedServers.connect(linkId);
        try {
            await ask(client, 10000, "move:hello");
            const totalBytes = await estimateBytes(stack, source);
            const target = await ask<PreflightResult>(client, 60000, "move:preflight", {
                stackName,
                ports: source.ports,
                externalNetworks: source.externalNetworks,
                volumes: source.volumes.map((v) => v.name),
                arch: source.arch,
                totalBytes,
            });

            const warnings = [ ...target.warnings ];
            if (source.outsideBinds.length > 0) {
                warnings.push(`Folders outside the stack folder are not moved, make sure they exist on ${link.name}: ${source.outsideBinds.join(", ")}`);
            }
            if (source.skippedVolumes.length > 0) {
                warnings.push(`External or non-local volumes are not moved: ${source.skippedVolumes.join(", ")}`);
            }
            if (fs.existsSync(path.join(server.stacksDir, "global.env"))) {
                warnings.push(`global.env is not moved, the stack uses ${link.name}'s own global.env there`);
            }
            if (readMovedMarker(stack)) {
                warnings.push("This stack was already moved once, this copy is the stopped original");
            }
            if (typeof process.getuid === "function" && process.getuid() !== 0) {
                warnings.push("Dockge does not run as root here, so files only readable by other users can't be packed");
            }

            return {
                source,
                target: { ...target,
                    name: link.name,
                    url: link.url },
                problems: target.problems,
                warnings,
            };
        } finally {
            client.disconnect();
        }
    }

    static async move(server : DockgeServer, stackName : string, linkId : string, onProgress : (p : MoveProgress) => void) {
        if (this.active.has(stackName)) {
            throw new Error("This stack is already being moved");
        }
        this.active.add(stackName);

        let link : LinkedServer | undefined;
        let client : Socket | undefined;
        const transferId = randomUUID();
        const workDir = path.join(path.resolve(server.stacksDir), MOVE_DIR, transferId);
        let stopped = false;
        let wasRunning = false;
        const report = (p : Omit<MoveProgress, "stackName">) => onProgress({ stackName,
            target: link?.name,
            targetURL: link?.url,
            ...p });

        try {
            const stack = await Stack.getStack(server, stackName);
            const inspection = await inspectStack(stack);
            wasRunning = inspection.running;

            const connection = await LinkedServers.connect(linkId);
            link = connection.link;
            client = connection.client;

            // Check again right before stopping anything
            const check = await this.check(server, stackName, linkId);
            if (check.problems.length > 0) {
                throw new Error(check.problems.join(". "));
            }

            // 1. Stop
            report({ phase: "stop",
                message: "Stopping the stack" });
            if (inspection.deployed) {
                await run("docker", stack.getComposeOptions("down"), stack.path);
                stopped = true;
            }

            // 2. Pack
            report({ phase: "pack",
                message: "Packing the stack folder" });
            await fsAsync.mkdir(workDir, { recursive: true,
                mode: 0o700 });
            const files : (ManifestFile & { local : string })[] = [];
            const folderFile = path.join(workDir, "folder.tar.gz");
            await packFolder(path.resolve(server.stacksDir), stackName, folderFile, [ MOVED_MARKER ]);
            files.push({ kind: "folder",
                local: folderFile,
                size: 0,
                sha256: "" });

            for (const [ i, volume ] of inspection.volumes.entries()) {
                report({ phase: "pack",
                    message: `Packing volume ${volume.name}` });
                const name = `volume-${i}.tar.gz`;
                await exportVolume(volume.name, workDir, name);
                files.push({ kind: "volume",
                    volume: volume.name,
                    labels: volume.labels,
                    local: path.join(workDir, name),
                    size: 0,
                    sha256: "" });
            }
            for (const f of files) {
                f.size = (await fsAsync.stat(f.local)).size;
                f.sha256 = await sha256File(f.local);
            }

            // 3. Transfer
            const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
            await ask(client, ACK_TIMEOUT_MS, "move:begin", transferId, stackName, files.map(({ local, ...f }) => f));
            let sentBytes = 0;
            let lastReport = 0;
            report({ phase: "transfer",
                percent: 0,
                sentBytes,
                totalBytes,
                message: `Sending ${formatBytes(totalBytes)}` });

            for (const [ index, f ] of files.entries()) {
                const handle = await fsAsync.open(f.local, "r");
                try {
                    const inFlight = new Set<Promise<unknown>>();
                    for (let offset = 0; offset < f.size; offset += CHUNK_SIZE) {
                        const length = Math.min(CHUNK_SIZE, f.size - offset);
                        const buffer = Buffer.alloc(length);
                        await handle.read(buffer, 0, length, offset);
                        const sent = ask(client, ACK_TIMEOUT_MS, "move:chunk", transferId, index, buffer).then(() => {
                            sentBytes += length;
                            const now = Date.now();
                            if (now - lastReport > 250 || sentBytes === totalBytes) {
                                lastReport = now;
                                report({ phase: "transfer",
                                    percent: Math.round((sentBytes / Math.max(totalBytes, 1)) * 100),
                                    sentBytes,
                                    totalBytes,
                                    message: `Sending ${formatBytes(sentBytes)} of ${formatBytes(totalBytes)}` });
                            }
                        });
                        inFlight.add(sent);
                        sent.finally(() => inFlight.delete(sent)).catch(() => {});
                        if (inFlight.size >= WINDOW) {
                            await Promise.race(inFlight);
                        }
                    }
                    await Promise.all(inFlight);
                } finally {
                    await handle.close();
                }
            }

            // 4. Unpack and start there
            report({ phase: wasRunning ? "start" : "unpack",
                message: wasRunning ? `Unpacking and starting on ${link.name}` : `Unpacking on ${link.name}` });
            await ask(client, FINISH_TIMEOUT_MS, "move:finish", transferId, wasRunning);

            // 5. Mark the stopped copy here
            const marker : MovedMarker = {
                linkId: link.id,
                name: link.name,
                url: link.url,
                at: Date.now(),
                volumes: inspection.volumes.map((v) => v.name),
            };
            await fsAsync.writeFile(path.join(stack.path, MOVED_MARKER), JSON.stringify(marker, null, "\t"));

            log.info("stack-move", `Moved ${stackName} to ${link.name} (${link.url})`);
            report({ phase: "done",
                message: wasRunning ? `Running on ${link.name}` : `Moved to ${link.name}` });
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            log.warn("stack-move", `Moving ${stackName} failed: ${message}`);
            if (client?.connected) {
                await client.timeout(30000).emitWithAck("move:abort", transferId).catch(() => {});
            }
            if (stopped && wasRunning) {
                report({ phase: "rollback",
                    message: "Starting the stack here again" });
                try {
                    const stack = await Stack.getStack(server, stackName);
                    await run("docker", stack.getComposeOptions("up", "-d", "--remove-orphans"), stack.path);
                } catch (restartError) {
                    log.error("stack-move", `Could not restart ${stackName}: ${restartError}`);
                }
            }
            report({ phase: "failed",
                message });
        } finally {
            client?.disconnect();
            await fsAsync.rm(workDir, { recursive: true,
                force: true }).catch(() => {});
            this.active.delete(stackName);
            server.sendStackList();
        }
    }

    /**
     * Delete the stopped copy left behind by a move: containers, the moved named volumes, folder
     */
    static async removeSource(server : DockgeServer, stackName : string) {
        const stack = await Stack.getStack(server, stackName);
        const marker = readMovedMarker(stack);
        if (!marker) {
            throw new Error("This stack was not moved, use Delete instead");
        }
        await run("docker", stack.getComposeOptions("down", "--remove-orphans"), stack.path).catch(() => "");
        for (const volume of marker.volumes) {
            await run("docker", [ "volume", "rm", volume ]).catch(() => "");
        }
        await fsAsync.rm(stack.path, { recursive: true,
            force: true });
        server.sendStackList();
        log.info("stack-move", `Removed the moved copy of ${stackName}`);
    }
}
