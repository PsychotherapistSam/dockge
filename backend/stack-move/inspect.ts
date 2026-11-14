/*
 * What a stack needs on the other side: published ports, external networks, named volumes,
 * and bind mounts that point outside its folder (those are not moved).
 */
import path from "path";
import fs from "fs";
import { Stack } from "../stack";
import { RUNNING, LooseObject } from "../../common/util-common";
import { run } from "./archive";

export interface StackVolume {
    name : string;
    driver : string;
    labels : Record<string, string>;
}

export interface StackInspection {
    name : string;
    running : boolean;
    deployed : boolean;
    /** "8080/tcp", ranges expanded */
    ports : string[];
    externalNetworks : string[];
    volumes : StackVolume[];
    /** Named volumes that use a non-local driver or are marked external, not moved */
    skippedVolumes : string[];
    /** Host paths outside the stack folder, not moved */
    outsideBinds : string[];
    arch : string;
}

export async function dockerArch() : Promise<string> {
    try {
        return (await run("docker", [ "info", "--format", "{{.Architecture}}" ])).trim();
    } catch (e) {
        return "";
    }
}

function expandPorts(published : unknown, protocol : unknown) : string[] {
    const proto = typeof protocol === "string" && protocol ? protocol : "tcp";
    const text = String(published ?? "").trim();
    if (!text) {
        return [];
    }
    const range = text.match(/^(\d+)-(\d+)$/);
    if (range) {
        const from = Number(range[1]);
        const to = Math.min(Number(range[2]), from + 1000);
        const out : string[] = [];
        for (let p = from; p <= to; p++) {
            out.push(`${p}/${proto}`);
        }
        return out;
    }
    return /^\d+$/.test(text) ? [ `${text}/${proto}` ] : [];
}

function isInside(child : string, parent : string) : boolean {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function inspectStack(stack : Stack) : Promise<StackInspection> {
    if (!stack.isManagedByDockge) {
        throw new Error("Only stacks managed by Dockge (in its stacks folder) can be moved");
    }

    const config : LooseObject = (await stack.getResolvedConfig()) ?? {};
    const stackDir = fs.realpathSync(stack.fullPath);

    const ports = new Set<string>();
    const outsideBinds = new Set<string>();
    for (const service of Object.values((config.services ?? {}) as Record<string, LooseObject>)) {
        for (const port of service.ports ?? []) {
            for (const p of expandPorts(port.published, port.protocol)) {
                ports.add(p);
            }
        }
        for (const volume of service.volumes ?? []) {
            if (volume?.type === "bind" && typeof volume.source === "string") {
                let source = volume.source;
                try {
                    source = fs.realpathSync(source);
                } catch (e) {
                    // Path does not exist here, compare as written
                }
                if (!isInside(source, stackDir)) {
                    outsideBinds.add(volume.source);
                }
            }
        }
    }

    const externalNetworks = Object.entries((config.networks ?? {}) as Record<string, LooseObject>)
        .filter(([ , n ]) => n?.external)
        .map(([ key, n ]) => n.name || key);

    // Named volumes: those declared in the compose file that exist on this daemon
    const volumes : StackVolume[] = [];
    const skippedVolumes : string[] = [];
    for (const [ key, v ] of Object.entries((config.volumes ?? {}) as Record<string, LooseObject>)) {
        const name = v?.name || `${stack.name}_${key}`;
        if (v?.external) {
            skippedVolumes.push(name);
            continue;
        }
        let info : LooseObject | undefined;
        try {
            info = JSON.parse(await run("docker", [ "volume", "inspect", name ]))[0];
        } catch (e) {
            // Not created yet (stack never started), nothing to move
            continue;
        }
        if (info?.Driver && info.Driver !== "local") {
            skippedVolumes.push(name);
            continue;
        }
        volumes.push({
            name,
            driver: info?.Driver ?? "local",
            labels: info?.Labels ?? {},
        });
    }

    await stack.updateStatus();
    let deployed = false;
    try {
        deployed = (await run("docker", [ "compose", "ls", "--all", "--format", "json" ])).includes(`"Name":"${stack.name}"`);
    } catch (e) {
        // ignore
    }

    return {
        name: stack.name,
        running: stack.status === RUNNING,
        deployed,
        ports: [ ...ports ],
        externalNetworks,
        volumes,
        skippedVolumes,
        outsideBinds: [ ...outsideBinds ],
        arch: await dockerArch(),
    };
}

/** Host ports currently published by containers on this daemon, like "8080/tcp" */
export async function usedHostPorts() : Promise<Set<string>> {
    const used = new Set<string>();
    try {
        const out = await run("docker", [ "ps", "--format", "{{.Ports}}" ]);
        for (const match of out.matchAll(/:(\d+)(?:-(\d+))?->\d+(?:-\d+)?\/(tcp|udp|sctp)/g)) {
            const from = Number(match[1]);
            const to = match[2] ? Number(match[2]) : from;
            for (let p = from; p <= to && p - from <= 1000; p++) {
                used.add(`${p}/${match[3]}`);
            }
        }
    } catch (e) {
        // ignore
    }
    return used;
}
