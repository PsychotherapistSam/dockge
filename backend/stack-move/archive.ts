/*
 * Packing and unpacking for stack moves.
 *
 * Everything keeps numeric owners, permissions, ACLs and extended attributes, so restrictive
 * folders (databases running as their own uid, 0700 dirs) arrive exactly as they left.
 * `--numeric-owner` matters here: Dockge runs in a container whose user list differs from the
 * host, and matching by name could hand files to the wrong uid.
 *
 * Named volumes are read and written through a short-lived helper container, mounting a
 * folder under the stacks directory (which has the same path on the host and in Dockge).
 */
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import childProcessAsync from "promisify-child-process";

/** GNU tar with ACL and xattr support, used for named volumes */
export const HELPER_IMAGE = "debian:bookworm-slim";
const GNU_TAR_EXTRAS = [ "--acls", "--xattrs", "--xattrs-include=*" ];

/**
 * On Windows use the system bsdtar: it handles drive-letter paths and gzip itself, unlike the
 * GNU tar that Git for Windows puts on the PATH (which reads "C:" as a remote host).
 */
const TAR = process.platform === "win32"
    ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";

let gnuTar : boolean | undefined;

/** Whether the local `tar` is GNU tar (Linux, the Dockge image) or bsdtar (macOS, Windows) */
export async function hasGnuTar() : Promise<boolean> {
    if (gnuTar === undefined) {
        try {
            const res = await childProcessAsync.spawn(TAR, [ "--version" ], { encoding: "utf-8" });
            gnuTar = /GNU tar/.test((res.stdout ?? "").toString());
        } catch (e) {
            gnuTar = false;
        }
    }
    return gnuTar;
}

async function localTarExtras() : Promise<string[]> {
    return (await hasGnuTar()) ? GNU_TAR_EXTRAS : [];
}

export async function run(command : string, args : string[], cwd? : string) : Promise<string> {
    try {
        const res = await childProcessAsync.spawn(command, args, {
            cwd,
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

/** Pack `<stacksDir>/<name>` into `outFile` (entries start with `<name>/`), minus `exclude` paths inside it */
export async function packFolder(stacksDir : string, name : string, outFile : string, exclude : string[] = []) {
    const excludeArgs = exclude.map((e) => `--exclude=${name}/${e}`);
    await run(TAR, [ "-czpf", outFile, "--numeric-owner", ...(await localTarExtras()), ...excludeArgs, "-C", stacksDir, name ]);
}

/** Make sure every entry in a stack archive stays inside `<name>/` */
export async function verifyFolderArchive(file : string, name : string) {
    const list = await run(TAR, [ "-tzf", file ]);
    for (const entry of list.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const clean = entry.replace(/^\.\//, "");
        if (!(clean === name || clean === name + "/" || clean.startsWith(name + "/")) || clean.split("/").includes("..")) {
            throw new Error(`The archive contains an unexpected path: ${entry}`);
        }
    }
}

export async function unpackFolder(file : string, stacksDir : string) {
    await run(TAR, [ "-xzpf", file, "--same-owner", "--numeric-owner", ...(await localTarExtras()), "-C", stacksDir ]);
}

/** Export a named volume to `<dir>/<fileName>` through the helper container */
export async function exportVolume(volume : string, dir : string, fileName : string) {
    await run("docker", [
        "run", "--rm",
        "-v", `${volume}:/volume:ro`,
        "-v", `${dir}:/backup`,
        HELPER_IMAGE,
        "tar", "-czpf", `/backup/${fileName}`, "--numeric-owner", ...GNU_TAR_EXTRAS, "-C", "/volume", ".",
    ]);
}

/** Create a named volume with the given labels and fill it from `<dir>/<fileName>` */
export async function importVolume(volume : string, labels : Record<string, string>, dir : string, fileName : string) {
    const labelArgs = Object.entries(labels).flatMap(([ k, v ]) => [ "--label", `${k}=${v}` ]);
    await run("docker", [ "volume", "create", ...labelArgs, volume ]);
    await run("docker", [
        "run", "--rm",
        "-v", `${volume}:/volume`,
        "-v", `${dir}:/backup:ro`,
        HELPER_IMAGE,
        "tar", "-xzpf", `/backup/${fileName}`, "--same-owner", "--numeric-owner", ...GNU_TAR_EXTRAS, "-C", "/volume",
    ]);
}

export function sha256File(file : string) : Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash("sha256");
        fs.createReadStream(file)
            .on("data", (chunk) => hash.update(chunk))
            .on("error", reject)
            .on("end", () => resolve(hash.digest("hex")));
    });
}
