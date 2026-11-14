// Works out the next release version from the commits since the last release
// tag, and writes release notes grouped by conventional-commit type.
//
// Env:
//   BUMP               auto | patch | minor | major (default: auto)
//   GITHUB_REPOSITORY  owner/repo, used for links (set by GitHub Actions)
//   GITHUB_OUTPUT      file to write step outputs to (set by GitHub Actions)
//   NOTES_FILE         where to write the release notes (default: release-notes.md)
//
// auto: a breaking change (`feat!:` or "BREAKING CHANGE") bumps major, any
// `feat:` bumps minor, anything else bumps patch.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf-8" }).trim();

const bumpInput = (process.env.BUMP || "auto").toLowerCase();
const repo = process.env.GITHUB_REPOSITORY || "owner/repo";
const server = process.env.GITHUB_SERVER_URL || "https://github.com";
const notesFile = process.env.NOTES_FILE || "release-notes.md";

// Last release tag reachable from HEAD (fork tags are vX.Y.Z, upstream's are X.Y.Z)
let lastTag = "";
try {
    lastTag = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*.[0-9]*.[0-9]*", "--match", "[0-9]*.[0-9]*.[0-9]*");
} catch {
    // No tag yet
}

const baseVersion = lastTag || JSON.parse(fs.readFileSync("package.json", "utf-8")).version;
const match = baseVersion.match(/^v?(\d+)\.(\d+)\.(\d+)/);
if (!match) {
    throw new Error(`Cannot parse version from "${baseVersion}"`);
}
let [ major, minor, patch ] = match.slice(1).map(Number);

const range = lastTag ? [ `${lastTag}..HEAD` ] : [ "HEAD" ];
const raw = git("log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e", ...range);
const commits = raw.split("\x1e").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [ sha, subject, body = "" ] = entry.split("\x1f");
    const m = subject.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);
    return {
        sha,
        subject,
        type: m ? m[1].toLowerCase() : "other",
        scope: m ? m[2] : undefined,
        description: m ? m[4] : subject,
        breaking: Boolean(m?.[3]) || /BREAKING[ -]CHANGE/.test(body),
    };
}).filter((c) => !/^chore(\(release\))?: release v?\d/.test(c.subject));

if (commits.length === 0) {
    throw new Error(`No commits since ${lastTag || "the beginning"}, nothing to release`);
}

let bump = bumpInput;
if (bump === "auto") {
    if (commits.some((c) => c.breaking)) {
        bump = "major";
    } else if (commits.some((c) => c.type === "feat")) {
        bump = "minor";
    } else {
        bump = "patch";
    }
}

if (bump === "major") {
    major++; minor = 0; patch = 0;
} else if (bump === "minor") {
    minor++; patch = 0;
} else if (bump === "patch") {
    patch++;
} else {
    throw new Error(`Unknown bump "${bumpInput}"`);
}

const version = `${major}.${minor}.${patch}`;
const tag = `v${version}`;

const sections = [
    [ "Breaking Changes", (c) => c.breaking ],
    [ "Features", (c) => !c.breaking && c.type === "feat" ],
    [ "Fixes", (c) => !c.breaking && c.type === "fix" ],
    [ "Other Changes", (c) => !c.breaking && c.type !== "feat" && c.type !== "fix" ],
];

const line = (c) => {
    const scope = c.scope ? `**${c.scope}:** ` : "";
    return `- ${scope}${c.description} ([${c.sha.slice(0, 7)}](${server}/${repo}/commit/${c.sha}))`;
};

let notes = "";
for (const [ title, filter ] of sections) {
    const list = commits.filter(filter);
    if (list.length > 0) {
        notes += `## ${title}\n\n${list.map(line).join("\n")}\n\n`;
    }
}

notes += "## Docker Image\n\n```bash\n" + `docker pull ghcr.io/${repo.toLowerCase()}:${version}\n` + "```\n\n";
if (lastTag) {
    notes += `**Full Changelog**: ${server}/${repo}/compare/${lastTag}...${tag}\n`;
}

fs.writeFileSync(notesFile, notes);

const outputs = { version, tag, bump, previous: lastTag, notes_file: notesFile };
if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([ k, v ]) => `${k}=${v}`).join("\n") + "\n");
}
console.log(`${lastTag || "(no tag)"} -> ${tag} (${bump}, ${commits.length} commits)`);
