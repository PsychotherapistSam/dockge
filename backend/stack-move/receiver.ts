/*
 * The receiving side of a stack move: pre-flight checks, chunked upload, unpack, start.
 * Called through socket events by another Dockge that signed in to this one.
 */
import fs, { promises as fsAsync } from "fs";
import os from "os";
import path from "path";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { log } from "../log";
import { hasGnuTar, importVolume, run, sha256File, unpackFolder, verifyFolderArchive } from "./archive";
import { dockerArch, usedHostPorts } from "./inspect";

export const MOVE_DIR = ".dockge-move";
const STACK_NAME = /^[a-z0-9_-]+$/;
const VOLUME_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const TRANSFER_ID = /^[0-9a-f-]{36}$/;

export interface PreflightRequest {
    stackName : string;
    ports : string[];
    externalNetworks : string[];
    volumes : string[];
    arch : string;
    totalBytes : number;
}

export interface PreflightResult {
    problems : string[];
    warnings : string[];
    arch : string;
    freeBytes? : number;
}

export interface ManifestFile {
    kind : "folder" | "volume";
    size : number;
    sha256 : string;
    volume? : string;
    labels? : Record<string, string>;
}

interface Transfer {
    stackName : string;
    dir : string;
    files : ManifestFile[];
    written : number[];
    queue : Promise<void>;
}

export class MoveReceiver {
    protected transfers = new Map<string, Transfer>();

    constructor(protected server : DockgeServer) {
    }

    get stacksDir() : string {
        return path.resolve(this.server.stacksDir);
    }

    async preflight(req : PreflightRequest) : Promise<PreflightResult> {
        const problems : string[] = [];
        const warnings : string[] = [];

        if (!STACK_NAME.test(req.stackName)) {
            problems.push(`"${req.stackName}" is not a valid stack name`);
        } else {
            if (fs.existsSync(path.join(this.stacksDir, req.stackName))) {
                problems.push(`A stack folder named ${req.stackName} already exists here`);
            } else {
                try {
                    const list = JSON.parse(await run("docker", [ "compose", "ls", "--all", "--format", "json" ]));
                    if (list.some((s : { Name : string }) => s.Name === req.stackName)) {
                        problems.push(`A compose project named ${req.stackName} already runs here`);
                    }
                } catch (e) {
                    // ignore
                }
            }
        }

        const used = await usedHostPorts();
        const busy = req.ports.filter((p) => used.has(p));
        if (busy.length > 0) {
            problems.push(`Port${busy.length > 1 ? "s" : ""} already in use here: ${busy.join(", ")}`);
        }

        if (req.externalNetworks.length > 0) {
            const networks = (await run("docker", [ "network", "ls", "--format", "{{.Name}}" ])).split("\n").map((n) => n.trim());
            const missing = req.externalNetworks.filter((n) => !networks.includes(n));
            if (missing.length > 0) {
                problems.push(`Missing external network${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
            }
        }

        for (const volume of req.volumes) {
            if (!VOLUME_NAME.test(volume)) {
                problems.push(`"${volume}" is not a valid volume name`);
                continue;
            }
            try {
                await run("docker", [ "volume", "inspect", volume ]);
                problems.push(`A volume named ${volume} already exists here`);
            } catch (e) {
                // Good, it doesn't
            }
        }

        const arch = await dockerArch();
        if (req.arch && arch && req.arch !== arch) {
            warnings.push(`This server is ${arch}, the source is ${req.arch}. Images must be available for ${arch}`);
        }

        let freeBytes : number | undefined;
        try {
            const stat = fs.statfsSync(this.stacksDir);
            freeBytes = stat.bavail * stat.bsize;
            // Compressed archives plus their unpacked contents
            if (freeBytes < req.totalBytes * 2) {
                problems.push(`Not enough free space here: ${formatBytes(freeBytes)} free, about ${formatBytes(req.totalBytes * 2)} needed`);
            }
        } catch (e) {
            // statfs not available, skip
        }

        if (typeof process.getuid === "function" && process.getuid() !== 0) {
            warnings.push("Dockge does not run as root here, so file owners may not be restored");
        }
        if (!(await hasGnuTar())) {
            warnings.push("tar here is not GNU tar, ACLs and extended attributes of the folder are not restored");
        }

        return { problems,
            warnings,
            arch,
            freeBytes };
    }

    async begin(id : string, stackName : string, files : ManifestFile[]) {
        if (!TRANSFER_ID.test(id) || !STACK_NAME.test(stackName)) {
            throw new Error("Invalid transfer");
        }
        if (files.filter((f) => f.kind === "folder").length !== 1) {
            throw new Error("A move needs exactly one stack folder");
        }
        for (const f of files) {
            if (f.kind === "volume" && !(f.volume && VOLUME_NAME.test(f.volume))) {
                throw new Error("Invalid volume in transfer");
            }
        }
        const dir = path.join(this.stacksDir, MOVE_DIR, id);
        await fsAsync.mkdir(dir, { recursive: true,
            mode: 0o700 });
        this.transfers.set(id, {
            stackName,
            dir,
            files,
            written: files.map(() => 0),
            queue: Promise.resolve(),
        });
        log.info("stack-move", `Receiving ${stackName} (${files.length} file(s))`);
    }

    /** Append one chunk; writes are serialised per transfer so chunks land in order */
    chunk(id : string, index : number, data : Buffer) : Promise<void> {
        const t = this.transfers.get(id);
        if (!t || !t.files[index]) {
            return Promise.reject(new Error("Unknown transfer"));
        }
        const write = t.queue.then(async () => {
            if (t.written[index] + data.length > t.files[index].size) {
                throw new Error("More data than announced");
            }
            await fsAsync.appendFile(path.join(t.dir, `file-${index}.tar.gz`), data);
            t.written[index] += data.length;
        });
        t.queue = write.catch(() => {});
        return write;
    }

    /**
     * Verify, unpack, optionally start. Rolls back what it created if anything fails.
     */
    async finish(id : string, start : boolean) : Promise<string> {
        const t = this.transfers.get(id);
        if (!t) {
            throw new Error("Unknown transfer");
        }
        await t.queue;

        const stackDir = path.join(this.stacksDir, t.stackName);
        const createdVolumes : string[] = [];
        let createdFolder = false;
        try {
            for (let i = 0; i < t.files.length; i++) {
                const file = path.join(t.dir, `file-${i}.tar.gz`);
                if (t.written[i] !== t.files[i].size || (await sha256File(file)) !== t.files[i].sha256) {
                    throw new Error("A file arrived incomplete or corrupted, nothing was changed");
                }
            }

            if (fs.existsSync(stackDir)) {
                throw new Error(`A stack folder named ${t.stackName} appeared here in the meantime`);
            }

            const folderIndex = t.files.findIndex((f) => f.kind === "folder");
            const folderFile = path.join(t.dir, `file-${folderIndex}.tar.gz`);
            await verifyFolderArchive(folderFile, t.stackName);
            createdFolder = true;
            await unpackFolder(folderFile, this.stacksDir);

            for (let i = 0; i < t.files.length; i++) {
                const f = t.files[i];
                if (f.kind === "volume" && f.volume) {
                    createdVolumes.push(f.volume);
                    await importVolume(f.volume, f.labels ?? {}, t.dir, `file-${i}.tar.gz`);
                }
            }

            let output = "";
            if (start) {
                const stack = await Stack.getStack(this.server, t.stackName);
                try {
                    output = await run("docker", stack.getComposeOptions("up", "-d", "--remove-orphans"), stackDir);
                } catch (e) {
                    throw new Error(`Starting the stack on the other server failed, so it was removed there again. ${e instanceof Error ? e.message : e}`);
                }
            }

            this.server.sendStackList();
            log.info("stack-move", `Received ${t.stackName}` + (start ? " and started it" : ""));
            return output;
        } catch (e) {
            log.warn("stack-move", `Receiving ${t.stackName} failed, rolling back: ${e instanceof Error ? e.message : e}`);
            if (start) {
                await run("docker", [ "compose", "-p", t.stackName, "down" ], this.stacksDir).catch(() => "");
            }
            for (const volume of createdVolumes) {
                await run("docker", [ "volume", "rm", volume ]).catch(() => "");
            }
            if (createdFolder) {
                await fsAsync.rm(stackDir, { recursive: true,
                    force: true }).catch(() => {});
            }
            throw e;
        } finally {
            await this.cleanup(id);
        }
    }

    async cleanup(id : string) {
        const t = this.transfers.get(id);
        this.transfers.delete(id);
        const dir = t?.dir ?? (TRANSFER_ID.test(id) ? path.join(this.stacksDir, MOVE_DIR, id) : "");
        if (dir) {
            await fsAsync.rm(dir, { recursive: true,
                force: true }).catch(() => {});
            // Fails while another transfer is in progress, which is fine
            await fsAsync.rmdir(path.dirname(dir)).catch(() => {});
        }
    }
}

export function formatBytes(bytes : number) : string {
    const units = [ "B", "KB", "MB", "GB", "TB" ];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function hostName() : string {
    return os.hostname();
}
