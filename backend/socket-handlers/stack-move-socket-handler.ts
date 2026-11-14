/*
 * Socket events for linked servers and stack moves.
 *
 * Two audiences:
 * - the browser on this server: manage links, check and start a move, remove the moved copy
 * - another Dockge that signed in to this one: the `move:*` events of the receiving side
 */
import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { LinkedServers } from "../stack-move/links";
import { StackMover } from "../stack-move/mover";
import { MoveReceiver } from "../stack-move/receiver";
import packageJSON from "../../package.json";

const receivers = new WeakMap<DockgeServer, MoveReceiver>();

function receiverFor(server : DockgeServer) : MoveReceiver {
    let receiver = receivers.get(server);
    if (!receiver) {
        receiver = new MoveReceiver(server);
        receivers.set(server, receiver);
    }
    return receiver;
}

function requireStrings(...values : unknown[]) {
    for (const v of values) {
        if (typeof v !== "string") {
            throw new ValidationError("Invalid request");
        }
    }
}

export class StackMoveSocketHandler extends SocketHandler {
    create(socket : DockgeSocket, server : DockgeServer) {
        // ---------- Linked servers (browser) ----------
        socket.on("linkedServerList", async (callback) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    links: await LinkedServers.list() }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("linkedServerAdd", async (url : unknown, username : unknown, password : unknown, name : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(url, username, password, name);
                const link = await LinkedServers.add(url as string, username as string, password as string, name as string);
                callbackResult({ ok: true,
                    link,
                    msg: "linkedServerAdded",
                    msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("linkedServerRemove", async (id : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(id);
                await LinkedServers.remove(id as string);
                callbackResult({ ok: true,
                    msg: "linkedServerRemoved",
                    msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("linkedServerTest", async (id : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(id);
                callbackResult({ ok: true,
                    ...(await LinkedServers.test(id as string)) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // ---------- Moving a stack (browser, sending side) ----------
        socket.on("moveStackCheck", async (stackName : unknown, linkId : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(stackName, linkId);
                callbackResult({ ok: true,
                    check: await StackMover.check(server, stackName as string, linkId as string) }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("moveStackStart", async (stackName : unknown, linkId : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(stackName, linkId);
                if (StackMover.active.has(stackName as string)) {
                    throw new ValidationError("This stack is already being moved");
                }
                callbackResult({ ok: true }, callback);
                // Runs in the background, progress goes to every tab of this user
                StackMover.move(server, stackName as string, linkId as string, (progress) => {
                    server.io.to(String(socket.userID)).emit("moveStackProgress", progress);
                });
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("moveStackRemoveSource", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(stackName);
                await StackMover.removeSource(server, stackName as string);
                callbackResult({ ok: true,
                    msg: "moveRemovedSource",
                    msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // ---------- Receiving side (another Dockge) ----------
        socket.on("move:hello", async (callback) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    version: packageJSON.version }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("move:preflight", async (request : unknown, callback) => {
            try {
                checkLogin(socket);
                const req = request as Record<string, unknown>;
                if (!req || typeof req.stackName !== "string" || !Array.isArray(req.ports) || !Array.isArray(req.externalNetworks) || !Array.isArray(req.volumes)) {
                    throw new ValidationError("Invalid pre-flight request");
                }
                const result = await receiverFor(server).preflight({
                    stackName: req.stackName,
                    ports: req.ports.map(String),
                    externalNetworks: req.externalNetworks.map(String),
                    volumes: req.volumes.map(String),
                    arch: typeof req.arch === "string" ? req.arch : "",
                    totalBytes: Number(req.totalBytes) || 0,
                });
                callbackResult({ ok: true,
                    ...result }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("move:begin", async (id : unknown, stackName : unknown, files : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(id, stackName);
                if (!Array.isArray(files)) {
                    throw new ValidationError("Invalid file list");
                }
                await receiverFor(server).begin(id as string, stackName as string, files);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("move:chunk", async (id : unknown, index : unknown, data : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof id !== "string" || typeof index !== "number" || !Buffer.isBuffer(data)) {
                    throw new ValidationError("Invalid chunk");
                }
                await receiverFor(server).chunk(id, index, data);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("move:finish", async (id : unknown, start : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(id);
                const output = await receiverFor(server).finish(id as string, start === true);
                callbackResult({ ok: true,
                    output }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("move:abort", async (id : unknown, callback) => {
            try {
                checkLogin(socket);
                requireStrings(id);
                await receiverFor(server).cleanup(id as string);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
