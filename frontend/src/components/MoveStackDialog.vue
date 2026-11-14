<template>
    <BModal
        :model-value="modelValue"
        :title="$t('moveTitle', { name: stackName })"
        :no-close-on-backdrop="busy"
        :no-close-on-esc="busy"
        :hide-header-close="busy"
        size="lg"
        @update:model-value="close"
    >
        <!-- 1. Choose a server -->
        <template v-if="step === 'choose' || step === 'checking' || step === 'checked'">
            <p class="intro">{{ $t("moveIntro") }}</p>

            <div v-if="linksLoaded && links.length === 0" class="empty">
                {{ $t("moveNoLinks") }}
                <router-link to="/settings/linked" @click="close(false)">{{ $t("moveLinkOne") }}</router-link>
            </div>

            <div v-else class="target-row">
                <label for="move-target" class="form-label">{{ $t("moveTarget") }}</label>
                <div class="target-controls">
                    <select id="move-target" v-model="linkId" class="form-select" :disabled="step === 'checking'" @change="step = 'choose'; check = null">
                        <option v-for="link in links" :key="link.id" :value="link.id">{{ link.name }} ({{ link.url }})</option>
                    </select>
                    <button class="btn btn-normal" type="button" :disabled="!linkId || step === 'checking'" @click="runCheck">
                        <font-awesome-icon :icon="step === 'checking' ? 'spinner' : 'arrows-rotate'" :spin="step === 'checking'" />
                        {{ $t("moveCheck") }}
                    </button>
                </div>
            </div>

            <!-- 2. Check results -->
            <div v-if="check" class="check-results">
                <ul class="check-list">
                    <li v-for="(problem, i) in check.problems" :key="'p' + i" class="bad">
                        <font-awesome-icon icon="times-circle" />{{ problem }}
                    </li>
                    <li v-for="(warning, i) in check.warnings" :key="'w' + i" class="warn">
                        <font-awesome-icon icon="exclamation-circle" />{{ warning }}
                    </li>
                    <li v-if="check.problems.length === 0" class="good">
                        <font-awesome-icon icon="check-circle" />{{ $t("moveChecksPassed", { name: check.target.name }) }}
                    </li>
                </ul>

                <dl class="move-summary">
                    <dt>{{ $t("moveWhatFolder") }}</dt>
                    <dd class="mono">{{ stackName }}/</dd>
                    <template v-if="check.source.volumes.length > 0">
                        <dt>{{ $t("moveWhatVolumes") }}</dt>
                        <dd class="mono">{{ check.source.volumes.map(v => v.name).join(", ") }}</dd>
                    </template>
                    <dt>{{ $t("moveWhatAfter") }}</dt>
                    <dd>{{ check.source.running ? $t("moveAfterRunning", { name: check.target.name }) : $t("moveAfterStopped", { name: check.target.name }) }}</dd>
                    <dt>{{ $t("moveWhatHere") }}</dt>
                    <dd>{{ $t("moveHereStays") }}</dd>
                </dl>
            </div>
        </template>

        <!-- 3. Progress -->
        <template v-if="step === 'moving' || step === 'done' || step === 'failed'">
            <ol class="phases">
                <li v-for="phase in phaseList" :key="phase.id" :class="phaseState(phase.id)">
                    <span class="phase-icon">
                        <font-awesome-icon v-if="phaseState(phase.id) === 'active'" icon="spinner" spin />
                        <font-awesome-icon v-else-if="phaseState(phase.id) === 'complete'" icon="check" />
                        <font-awesome-icon v-else-if="phaseState(phase.id) === 'error'" icon="times" />
                        <span v-else class="phase-dot"></span>
                    </span>
                    <span class="phase-label">{{ phase.label }}</span>
                    <span v-if="phase.id === 'transfer' && progress.totalBytes && phaseState('transfer') !== 'pending'" class="phase-detail mono">{{ progress.percent ?? 0 }}%</span>
                </li>
            </ol>

            <div v-if="progress.phase === 'transfer'" class="bar" role="progressbar" :aria-valuenow="progress.percent ?? 0" aria-valuemin="0" aria-valuemax="100">
                <div class="bar-fill" :style="{ width: (progress.percent ?? 0) + '%' }"></div>
            </div>
            <p v-if="progress.message && step === 'moving'" class="progress-message">{{ progress.message }}</p>

            <div v-if="step === 'done'" class="result good">
                <font-awesome-icon icon="check-circle" />
                <div>
                    <div class="result-title">{{ progress.message }}</div>
                    <div class="result-text">{{ $t("moveDoneHelp") }}</div>
                </div>
            </div>
            <div v-if="step === 'failed'" class="result bad">
                <font-awesome-icon icon="times-circle" />
                <div>
                    <div class="result-title">{{ $t("moveFailed") }}</div>
                    <div class="result-text">{{ progress.message }}</div>
                    <div class="result-text">{{ $t("moveFailedHelp") }}</div>
                </div>
            </div>
        </template>

        <template #footer>
            <template v-if="step === 'done'">
                <a :href="targetStackURL" target="_blank" rel="noopener" class="btn btn-normal">
                    <font-awesome-icon icon="external-link-square-alt" />
                    {{ $t("moveOpenThere", { name: progress.target }) }}
                </a>
                <button class="btn btn-primary" type="button" @click="close(false)">{{ $t("moveClose") }}</button>
            </template>
            <template v-else-if="step === 'failed'">
                <button class="btn btn-normal" type="button" @click="step = 'choose'; check = null">{{ $t("moveTryAgain") }}</button>
                <button class="btn btn-primary" type="button" @click="close(false)">{{ $t("moveClose") }}</button>
            </template>
            <template v-else-if="step === 'moving'">
                <span class="footer-note">{{ $t("moveKeepOpen") }}</span>
            </template>
            <template v-else>
                <button class="btn btn-normal" type="button" @click="close(false)">{{ $t("cancel") }}</button>
                <button class="btn btn-primary" type="button" :disabled="!check || check.problems.length > 0" @click="start">
                    <font-awesome-icon icon="rocket" />
                    {{ $t("moveStart") }}
                </button>
            </template>
        </template>
    </BModal>
</template>

<script>
import { BModal } from "bootstrap-vue-next";

const ORDER = [ "stop", "pack", "transfer", "start", "done" ];

export default {
    components: {
        BModal,
    },

    props: {
        modelValue: {
            type: Boolean,
            default: false,
        },
        stackName: {
            type: String,
            required: true,
        },
        /** Whether the stack runs now, to label the last phase */
        running: {
            type: Boolean,
            default: false,
        },
    },

    emits: [ "update:modelValue", "moved" ],

    data() {
        return {
            links: [],
            linksLoaded: false,
            linkId: "",
            step: "choose",
            check: null,
            progress: {},
            failedPhase: "",
            /** Whether the stack ran when the move started; its live status turns "stopped" mid-move */
            startsThere: false,
        };
    },

    computed: {
        busy() {
            return this.step === "moving";
        },

        phaseList() {
            const target = this.progress.target || this.check?.target?.name || "";
            return [
                { id: "stop",
                    label: this.$t("movePhaseStop") },
                { id: "pack",
                    label: this.$t("movePhasePack") },
                { id: "transfer",
                    label: this.$t("movePhaseTransfer", { name: target }) },
                { id: "start",
                    label: this.startsThere ? this.$t("movePhaseStart", { name: target }) : this.$t("movePhaseUnpack", { name: target }) },
            ];
        },

        targetStackURL() {
            const base = this.progress.targetURL || this.check?.target?.url || "";
            return `${base}/compose/${this.stackName}`;
        },
    },

    watch: {
        modelValue(open) {
            if (open && this.step !== "moving") {
                this.reset();
                this.loadLinks();
            }
        },
    },

    mounted() {
        this.$root.getSocket().on("moveStackProgress", this.onProgress);
    },

    unmounted() {
        this.$root.getSocket().off("moveStackProgress", this.onProgress);
    },

    methods: {
        reset() {
            this.startsThere = this.running;
            this.step = "choose";
            this.check = null;
            this.progress = {};
            this.failedPhase = "";
        },

        loadLinks() {
            this.$root.getSocket().emit("linkedServerList", (res) => {
                this.linksLoaded = true;
                if (res.ok) {
                    this.links = res.links;
                    if (!this.links.some((l) => l.id === this.linkId)) {
                        this.linkId = this.links[0]?.id ?? "";
                    }
                }
            });
        },

        runCheck() {
            this.step = "checking";
            this.check = null;
            this.$root.getSocket().emit("moveStackCheck", this.stackName, this.linkId, (res) => {
                if (res.ok) {
                    this.check = res.check;
                    this.step = "checked";
                } else {
                    this.step = "choose";
                    this.$root.toastRes(res);
                }
            });
        },

        start() {
            this.startsThere = this.check?.source?.running ?? this.running;
            this.step = "moving";
            this.progress = { phase: "stop",
                message: "" };
            this.$root.getSocket().emit("moveStackStart", this.stackName, this.linkId, (res) => {
                if (!res.ok) {
                    this.progress = { phase: "failed",
                        message: res.msg };
                    this.step = "failed";
                }
            });
        },

        onProgress(p) {
            if (p.stackName !== this.stackName) {
                return;
            }
            if (p.phase === "failed") {
                this.failedPhase = this.progress.phase === "rollback" ? this.failedPhase : this.progress.phase;
                this.step = "failed";
            } else if (p.phase === "rollback") {
                this.failedPhase = this.progress.phase;
            } else if (p.phase === "done") {
                this.step = "done";
                this.$emit("moved");
            } else {
                this.step = "moving";
            }
            const phase = p.phase === "unpack" ? "start" : p.phase;
            this.progress = { ...this.progress,
                ...p,
                phase };
        },

        phaseState(id) {
            if (this.step === "done") {
                return "complete";
            }
            const current = this.step === "failed" ? this.failedPhase : this.progress.phase;
            const at = ORDER.indexOf(current);
            const index = ORDER.indexOf(id);
            if (this.step === "failed" && id === current) {
                return "error";
            }
            if (index < at) {
                return "complete";
            }
            if (index === at && this.step === "moving") {
                return "active";
            }
            return "pending";
        },

        close(value) {
            if (this.busy) {
                return;
            }
            this.$emit("update:modelValue", value);
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.intro {
    color: var(--text-2);
    margin-bottom: 20px;
}

.empty {
    padding: 16px;
    border: 1px dashed var(--hairline-strong);
    border-radius: 12px;
    color: var(--text-2);

    a {
        margin-left: 4px;
        color: var(--accent-ink);
    }
}

.target-controls {
    display: flex;
    gap: 8px;

    .form-select {
        flex: 1;
        min-width: 0;
    }
}

.check-results {
    margin-top: 20px;
}

.check-list {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;

    li {
        display: flex;
        align-items: baseline;
        gap: 10px;
        line-height: 20px;

        svg {
            width: 14px;
            flex-shrink: 0;
            transform: translateY(2px);
        }
    }

    .bad svg {
        color: var(--err);
    }

    .warn svg {
        color: var(--warn);
    }

    .good svg {
        color: var(--accent-ink);
    }
}

.move-summary {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px 20px;
    margin: 0;
    padding: 16px;
    border-radius: 12px;
    background-color: var(--raised);
    font-size: 13px;

    dt {
        font-weight: 400;
        color: var(--text-3);
    }

    dd {
        margin: 0;
        color: var(--text);
        overflow-wrap: anywhere;
    }
}

.phases {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;

    li {
        display: flex;
        align-items: center;
        gap: 12px;
        color: var(--text-3);

        &.active,
        &.complete {
            color: var(--text);
        }

        &.error {
            color: var(--err);
        }
    }
}

.phase-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;

    svg {
        width: 13px;
    }

    .complete & {
        color: var(--accent-ink);
    }
}

.phase-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1.5px var(--text-3);
}

.phase-detail {
    margin-left: auto;
    font-size: 13px;
    color: var(--text-2);
}

.bar {
    height: 6px;
    border-radius: 3px;
    background-color: var(--raised);
    overflow: hidden;
}

.bar-fill {
    height: 100%;
    background-color: var(--accent);
    transition: width 0.25s $ease;
}

.progress-message {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--text-2);
}

.result {
    display: flex;
    gap: 12px;
    margin-top: 8px;
    padding: 16px;
    border-radius: 12px;
    background-color: var(--raised);

    > svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        margin-top: 2px;
    }

    &.good > svg {
        color: var(--accent-ink);
    }

    &.bad > svg {
        color: var(--err);
    }
}

.result-title {
    font-weight: 500;
}

.result-text {
    margin-top: 2px;
    font-size: 13px;
    color: var(--text-2);
}

.footer-note {
    margin-right: auto;
    font-size: 13px;
    color: var(--text-3);
}
</style>
