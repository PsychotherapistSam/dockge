import { log } from "./log";
import { compare, validate } from "compare-versions";
import packageJSON from "../package.json";
import { Settings } from "./settings";
import { GITHUB_REPO } from "../common/util-common";

// How much time in ms to wait between update checks
const UPDATE_CHECKER_INTERVAL_MS = 1000 * 60 * 60 * 48;
const RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`;

interface GitHubRelease {
    tag_name : string;
    draft : boolean;
    prerelease : boolean;
}

class CheckVersion {
    version = packageJSON.version;
    latestVersion? : string;
    interval? : NodeJS.Timeout;

    async startInterval() {
        const check = async () => {
            if (await Settings.get("checkUpdate") === false) {
                return;
            }

            log.debug("update-checker", "Retrieving latest versions");

            try {
                const res = await fetch(RELEASES_API_URL, {
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "User-Agent": "dockge-update-check",
                    },
                    signal: AbortSignal.timeout(15000),
                });
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const releases = await res.json() as GitHubRelease[];
                const checkBeta = await Settings.get("checkBeta");

                // Newest published release, including pre-releases only if beta is enabled
                let latest : string | undefined;
                for (const release of releases) {
                    if (release.draft || (release.prerelease && !checkBeta)) {
                        continue;
                    }
                    const version = release.tag_name.replace(/^v/, "");
                    if (validate(version) && (!latest || compare(version, latest, ">"))) {
                        latest = version;
                    }
                }

                // For debug
                if (process.env.TEST_CHECK_VERSION === "1") {
                    latest = "1000.0.0";
                }

                if (latest) {
                    this.latestVersion = latest;
                }
            } catch (e) {
                log.info("update-checker", "Failed to check for new versions: " + (e instanceof Error ? e.message : e));
            }
        };

        await check();
        this.interval = setInterval(check, UPDATE_CHECKER_INTERVAL_MS);
    }
}

const checkVersion = new CheckVersion();
export default checkVersion;
