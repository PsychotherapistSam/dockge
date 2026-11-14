/*
 * Linked servers: other Dockge instances this one can move stacks to.
 *
 * Unlike agents, linked servers never show up in the stack list. A link stores the target's
 * URL and a sign-in token (never the password); the token stops working when the password on
 * the target changes, which is what you want.
 */
import { randomUUID } from "crypto";
import { io, Socket } from "socket.io-client";
import { Settings } from "../settings";
import { LooseObject } from "../../common/util-common";

const SETTING_KEY = "linkedServers";
const SETTING_TYPE = "links";
const CONNECT_TIMEOUT_MS = 15 * 1000;

export interface LinkedServer {
    id : string;
    name : string;
    url : string;
    username : string;
    token : string;
    addedAt : number;
}

/** What the browser gets: no token */
export type PublicLinkedServer = Omit<LinkedServer, "token">;

export function normalizeURL(input : string) : string {
    let url : URL;
    try {
        url = new URL(input.trim());
    } catch (e) {
        throw new Error("Enter the full address, like http://server2:5001");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("The address must start with http:// or https://");
    }
    return url.origin;
}

/**
 * Open a socket.io connection to another Dockge and sign in.
 * Resolves with the connected, signed-in client.
 */
export function connectToDockge(url : string, auth : { token? : string, username? : string, password? : string }) : Promise<{ client : Socket, token? : string }> {
    return new Promise((resolve, reject) => {
        const client = io(url, {
            reconnection: false,
            transports: [ "websocket" ],
            timeout: CONNECT_TIMEOUT_MS,
        });

        const fail = (err : Error) => {
            client.disconnect();
            reject(err);
        };

        const timer = setTimeout(() => fail(new Error(`No answer from ${url}`)), CONNECT_TIMEOUT_MS + 2000);

        client.on("connect", () => {
            const done = (res : LooseObject) => {
                clearTimeout(timer);
                if (res?.ok) {
                    resolve({ client,
                        token: res.token });
                } else if (res?.tokenRequired) {
                    fail(new Error("That account uses two-factor sign-in, which linking doesn't support yet"));
                } else {
                    if (auth.token) {
                        fail(new Error(`The saved sign-in for ${url} no longer works, usually because the password there changed. Unlink the server and link it again`));
                    } else if (res?.msg === "authIncorrectCreds") {
                        fail(new Error("Wrong username or password for that server"));
                    } else {
                        fail(new Error(res?.msg ? `Sign-in failed: ${res.msg}` : "Sign-in failed"));
                    }
                }
            };
            if (auth.token) {
                client.emit("loginByToken", auth.token, done);
            } else {
                client.emit("login", { username: auth.username,
                    password: auth.password }, done);
            }
        });

        client.on("connect_error", (err) => {
            clearTimeout(timer);
            fail(new Error(`Cannot reach ${url} (${err.message})`));
        });
    });
}

export class LinkedServers {
    static async all() : Promise<LinkedServer[]> {
        const value = await Settings.get(SETTING_KEY);
        return Array.isArray(value) ? value : [];
    }

    static async list() : Promise<PublicLinkedServer[]> {
        return (await this.all()).map(({ token, ...rest }) => rest);
    }

    static async get(id : string) : Promise<LinkedServer> {
        const link = (await this.all()).find((l) => l.id === id);
        if (!link) {
            throw new Error("That linked server no longer exists");
        }
        return link;
    }

    /**
     * Sign in to the other Dockge once and keep the token
     */
    static async add(urlInput : string, username : string, password : string, nameInput : string) : Promise<PublicLinkedServer> {
        const url = normalizeURL(urlInput);
        const links = await this.all();
        if (links.some((l) => l.url === url)) {
            throw new Error("That server is already linked");
        }
        const { client, token } = await connectToDockge(url, { username,
            password });
        client.disconnect();
        if (!token) {
            throw new Error("The server did not return a sign-in token");
        }
        const link : LinkedServer = {
            id: randomUUID(),
            name: nameInput.trim() || new URL(url).host,
            url,
            username,
            token,
            addedAt: Date.now(),
        };
        links.push(link);
        await Settings.set(SETTING_KEY, links, SETTING_TYPE);
        const { token: _secret, ...publicLink } = link;
        return publicLink;
    }

    static async remove(id : string) {
        const links = (await this.all()).filter((l) => l.id !== id);
        await Settings.set(SETTING_KEY, links, SETTING_TYPE);
    }

    /** Connect with the stored token */
    static async connect(id : string) : Promise<{ link : LinkedServer, client : Socket }> {
        const link = await this.get(id);
        const { client } = await connectToDockge(link.url, { token: link.token });
        return { link,
            client };
    }

    /** Check the link works and what the other side supports */
    static async test(id : string) : Promise<{ version? : string, canReceive : boolean }> {
        const { client } = await this.connect(id);
        try {
            const res = await client.timeout(10000).emitWithAck("move:hello").catch(() => null);
            return {
                version: res?.version,
                canReceive: !!res?.ok,
            };
        } finally {
            client.disconnect();
        }
    }
}
