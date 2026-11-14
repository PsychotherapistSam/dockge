<template>
    <div class="cleanup">
        <div class="page-head">
            <div>
                <h1 class="page-title">{{ $t("cleanup") }}</h1>
                <p class="page-description">{{ $t("cleanupIntro") }}</p>
            </div>
            <div class="head-actions">
                <select v-if="$root.agentCount > 1" v-model="endpoint" class="form-select endpoint-select" :aria-label="$t('dockgeAgent')" @change="load">
                    <option v-for="(agent, agentEndpoint) in $root.agentList" :key="agentEndpoint" :value="agentEndpoint">
                        {{ agentEndpoint === "" ? $t("currentEndpoint") : (agent.name || agentEndpoint) }}
                    </option>
                </select>
                <button class="btn btn-normal" type="button" :disabled="loading || pruning" @click="load">
                    <font-awesome-icon icon="arrows-rotate" :spin="loading" />
                    {{ $t("cleanupRefresh") }}
                </button>
            </div>
        </div>

        <!-- Result of the last cleanup -->
        <div v-if="result" class="result-callout">
            <font-awesome-icon icon="check-circle" class="result-icon" />
            <div>
                <div class="result-title">{{ $t("cleanupFreed", { size: formatBytes(result.total) }) }}</div>
                <div class="result-detail">{{ result.detail }}</div>
            </div>
            <button type="button" class="btn-icon ms-auto" :title="$t('moveClose')" @click="result = null">
                <font-awesome-icon icon="times" />
            </button>
        </div>

        <div v-if="error" class="error-callout">
            <font-awesome-icon icon="exclamation-circle" />
            {{ error }}
        </div>

        <div v-if="!preview && loading" class="loading">
            <font-awesome-icon icon="spinner" spin /> {{ $t("cleanupLoading") }}
        </div>

        <div v-if="preview" class="groups">
            <!-- Stopped containers -->
            <section class="group" :class="{ off: !options.containers }">
                <header class="group-head">
                    <div class="form-check form-switch">
                        <input id="g-containers" v-model="options.containers" class="form-check-input" type="checkbox" role="switch" :disabled="preview.containers.length === 0" @change="load">
                    </div>
                    <label for="g-containers" class="group-title">{{ $t("cleanupContainers") }}</label>
                    <span class="group-figure mono">{{ preview.containers.length }}</span>
                </header>
                <p class="group-description">{{ $t("cleanupContainersHelp") }}</p>
                <ul v-if="preview.containers.length > 0" class="item-list">
                    <li v-for="c in visible('containers', preview.containers)" :key="c.id">
                        <span class="led off"></span>
                        <span class="item-name mono">{{ c.name }}</span>
                        <span v-if="c.stack" class="item-meta">{{ c.stack }}</span>
                        <span class="item-meta ms-auto">{{ c.status }}</span>
                    </li>
                </ul>
                <button v-if="preview.containers.length > LIMIT" type="button" class="more-link" @click="toggle('containers')">
                    {{ expanded.containers ? $t("showLess") : $t("cleanupShowAll", { n: preview.containers.length }) }}
                </button>
                <p v-if="preview.containers.length === 0" class="empty">{{ $t("cleanupNothing") }}</p>
            </section>

            <!-- Images -->
            <section class="group" :class="{ off: options.images === 'none' }">
                <header class="group-head">
                    <div class="form-check form-switch">
                        <input id="g-images" :checked="options.images !== 'none'" class="form-check-input" type="checkbox" role="switch" :disabled="preview.images.length === 0" @change="options.images = $event.target.checked ? 'dangling' : 'none'">
                    </div>
                    <label for="g-images" class="group-title">{{ $t("cleanupImages") }}</label>
                    <div v-if="options.images !== 'none'" class="btn-group mode" role="group" :aria-label="$t('cleanupImages')">
                        <input id="mode-dangling" v-model="options.images" type="radio" class="btn-check" value="dangling" autocomplete="off">
                        <label class="btn btn-outline-primary btn-sm" for="mode-dangling">{{ $t("cleanupDangling") }} <span class="mono">{{ danglingImages.length }}</span></label>
                        <input id="mode-all" v-model="options.images" type="radio" class="btn-check" value="all" autocomplete="off">
                        <label class="btn btn-outline-primary btn-sm" for="mode-all">{{ $t("cleanupAllUnused") }} <span class="mono">{{ preview.images.length }}</span></label>
                    </div>
                    <span class="group-figure mono">{{ formatBytes(imageBytes) }}</span>
                </header>
                <p class="group-description">{{ options.images === "all" ? $t("cleanupImagesAllHelp") : $t("cleanupImagesHelp") }}</p>
                <ul v-if="shownImages.length > 0" class="item-list">
                    <li v-for="image in visible('images', shownImages)" :key="image.id">
                        <span class="item-name mono">{{ image.tags[0] ?? image.id.replace("sha256:", "").slice(0, 12) }}</span>
                        <span v-if="image.tags.length > 1" class="item-meta">+{{ image.tags.length - 1 }}</span>
                        <span v-if="image.dangling" class="tag-chip">{{ $t("cleanupDanglingTag") }}</span>
                        <span v-if="image.stoppedOnly" class="tag-chip" :title="$t('cleanupStoppedOnlyHelp')">
                            {{ image.stacks.length ? $t("cleanupStoppedOnly", { stacks: image.stacks.join(", ") }) : $t("cleanupStoppedContainer") }}
                        </span>
                        <span class="item-meta mono ms-auto">{{ formatBytes(image.uniqueSize) }}</span>
                    </li>
                </ul>
                <button v-if="shownImages.length > LIMIT" type="button" class="more-link" @click="toggle('images')">
                    {{ expanded.images ? $t("showLess") : $t("cleanupShowAll", { n: shownImages.length }) }}
                </button>
                <p v-if="shownImages.length === 0" class="empty">{{ $t("cleanupNothing") }}</p>
            </section>

            <!-- Networks -->
            <section class="group" :class="{ off: !options.networks }">
                <header class="group-head">
                    <div class="form-check form-switch">
                        <input id="g-networks" v-model="options.networks" class="form-check-input" type="checkbox" role="switch" :disabled="preview.networks.length === 0">
                    </div>
                    <label for="g-networks" class="group-title">{{ $t("cleanupNetworks") }}</label>
                    <span class="group-figure mono">{{ preview.networks.length }}</span>
                </header>
                <p class="group-description">{{ $t("cleanupNetworksHelp") }}</p>
                <ul v-if="preview.networks.length > 0" class="item-list">
                    <li v-for="n in visible('networks', preview.networks)" :key="n.id">
                        <span class="item-name mono">{{ n.name }}</span>
                        <span v-if="n.stack" class="item-meta">{{ n.stack }}</span>
                    </li>
                </ul>
                <button v-if="preview.networks.length > LIMIT" type="button" class="more-link" @click="toggle('networks')">
                    {{ expanded.networks ? $t("showLess") : $t("cleanupShowAll", { n: preview.networks.length }) }}
                </button>
                <p v-if="preview.networks.length === 0" class="empty">{{ $t("cleanupNothing") }}</p>
            </section>

            <!-- Build cache -->
            <section class="group" :class="{ off: !options.buildCache }">
                <header class="group-head">
                    <div class="form-check form-switch">
                        <input id="g-cache" v-model="options.buildCache" class="form-check-input" type="checkbox" role="switch" :disabled="preview.buildCache.count === 0">
                    </div>
                    <label for="g-cache" class="group-title">{{ $t("cleanupBuildCache") }}</label>
                    <span class="group-figure mono">{{ formatBytes(preview.buildCache.reclaimable) }}</span>
                </header>
                <p class="group-description">{{ $t("cleanupBuildCacheHelp", { n: preview.buildCache.count }) }}</p>
            </section>

            <!-- Volumes, off by default -->
            <section class="group danger" :class="{ off: !options.volumes }">
                <header class="group-head">
                    <div class="form-check form-switch">
                        <input id="g-volumes" v-model="options.volumes" class="form-check-input" type="checkbox" role="switch" :disabled="!preview.volumesSupported || preview.volumes.length === 0">
                    </div>
                    <label for="g-volumes" class="group-title">{{ $t("cleanupVolumes") }}</label>
                    <span class="group-figure mono">{{ formatBytes(volumeBytes) }}</span>
                </header>
                <p class="group-description">
                    {{ preview.volumesSupported ? $t("cleanupVolumesHelp") : $t("cleanupVolumesUnsupported", { version: preview.dockerVersion }) }}
                </p>
                <ul v-if="preview.volumes.length > 0" class="item-list">
                    <li v-for="v in visible('volumes', preview.volumes)" :key="v.name">
                        <span class="item-name mono" :title="v.name">{{ v.name.slice(0, 16) }}…</span>
                        <span v-if="v.stoppedOnly" class="tag-chip" :title="$t('cleanupStoppedOnlyHelp')">
                            {{ v.stacks.length ? $t("cleanupStoppedOnly", { stacks: v.stacks.join(", ") }) : $t("cleanupStoppedContainer") }}
                        </span>
                        <span class="item-meta mono ms-auto">{{ formatBytes(v.size) }}</span>
                    </li>
                </ul>
                <button v-if="preview.volumes.length > LIMIT" type="button" class="more-link" @click="toggle('volumes')">
                    {{ expanded.volumes ? $t("showLess") : $t("cleanupShowAll", { n: preview.volumes.length }) }}
                </button>
                <p v-if="preview.volumesSupported && preview.volumes.length === 0" class="empty">{{ $t("cleanupNothing") }}</p>
            </section>
        </div>

        <!-- Action bar -->
        <div v-if="preview" class="action-bar">
            <div class="action-summary">
                <span class="action-figure mono">{{ formatBytes(estimate) }}</span>
                <span class="action-text">{{ $t("cleanupEstimate", { n: itemCount }) }}</span>
            </div>
            <button class="btn btn-danger" type="button" :disabled="itemCount === 0 || pruning || loading" @click="showConfirm = true">
                <font-awesome-icon :icon="pruning ? 'spinner' : 'broom'" :spin="pruning" />
                {{ pruning ? $t("cleanupRunning") : $t("cleanupRun") }}
            </button>
        </div>

        <BModal v-model="showConfirm" :title="$t('cleanupConfirmTitle')" :cancelTitle="$t('cancel')" :okTitle="$t('cleanupRun')" okVariant="danger" @ok="prune">
            <p>{{ $t("cleanupConfirmIntro") }}</p>
            <ul class="confirm-list">
                <li v-if="options.containers && preview?.containers.length">{{ $t("cleanupConfirmContainers", { n: preview.containers.length }) }}</li>
                <li v-if="options.images !== 'none' && shownImages.length">{{ $t("cleanupConfirmImages", { n: shownImages.length, size: formatBytes(imageBytes) }) }}</li>
                <li v-if="options.networks && preview?.networks.length">{{ $t("cleanupConfirmNetworks", { n: preview.networks.length }) }}</li>
                <li v-if="options.buildCache && preview?.buildCache.count">{{ $t("cleanupConfirmCache", { size: formatBytes(preview.buildCache.reclaimable) }) }}</li>
                <li v-if="options.volumes && preview?.volumes.length" class="text-danger">{{ $t("cleanupConfirmVolumes", { n: preview.volumes.length }) }}</li>
            </ul>
            <p v-if="affectedStacks.length > 0" class="confirm-warning">
                <font-awesome-icon icon="exclamation-circle" />
                {{ $t("cleanupConfirmStacks", { stacks: affectedStacks.join(", ") }) }}
            </p>
        </BModal>
    </div>
</template>

<script>
import { BModal } from "bootstrap-vue-next";

const LIMIT = 8;

export default {
    components: {
        BModal,
    },

    data() {
        return {
            LIMIT,
            endpoint: "",
            preview: null,
            loading: false,
            pruning: false,
            error: "",
            result: null,
            showConfirm: false,
            expanded: {},
            options: {
                containers: true,
                networks: true,
                images: "dangling",
                buildCache: true,
                volumes: false,
            },
        };
    },

    computed: {
        danglingImages() {
            return this.preview?.images.filter((i) => i.dangling) ?? [];
        },

        shownImages() {
            if (!this.preview || this.options.images === "none") {
                return [];
            }
            return this.options.images === "all" ? this.preview.images : this.danglingImages;
        },

        imageBytes() {
            return this.shownImages.reduce((sum, i) => sum + i.uniqueSize, 0);
        },

        volumeBytes() {
            return this.preview?.volumes.reduce((sum, v) => sum + v.size, 0) ?? 0;
        },

        estimate() {
            if (!this.preview) {
                return 0;
            }
            let total = this.options.images !== "none" ? this.imageBytes : 0;
            if (this.options.buildCache) {
                total += this.preview.buildCache.reclaimable;
            }
            if (this.options.volumes) {
                total += this.volumeBytes;
            }
            return total;
        },

        itemCount() {
            if (!this.preview) {
                return 0;
            }
            return (this.options.containers ? this.preview.containers.length : 0)
                + this.shownImages.length
                + (this.options.networks ? this.preview.networks.length : 0)
                + (this.options.buildCache ? this.preview.buildCache.count : 0)
                + (this.options.volumes ? this.preview.volumes.length : 0);
        },

        /** Stopped stacks whose containers go, they start again but may pull images */
        affectedStacks() {
            if (!this.preview || !this.options.containers) {
                return [];
            }
            return [ ...new Set(this.preview.containers.map((c) => c.stack).filter(Boolean)) ];
        },
    },

    mounted() {
        this.load();
    },

    methods: {
        load() {
            this.loading = true;
            this.error = "";
            this.$root.emitAgent(this.endpoint, "cleanupPreview", !this.options.containers, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.preview = res.preview;
                    if (this.preview.volumes.length === 0 || !this.preview.volumesSupported) {
                        this.options.volumes = false;
                    }
                } else {
                    this.error = res.msg;
                }
            });
        },

        prune() {
            this.pruning = true;
            this.result = null;
            this.$root.emitAgent(this.endpoint, "cleanupPrune", { ...this.options }, (res) => {
                this.pruning = false;
                if (res.ok) {
                    const total = res.steps.reduce((sum, s) => sum + s.reclaimed, 0);
                    const names = {
                        containers: this.$t("cleanupContainers"),
                        networks: this.$t("cleanupNetworks"),
                        images: this.$t("cleanupImages"),
                        buildCache: this.$t("cleanupBuildCache"),
                        volumes: this.$t("cleanupVolumes"),
                    };
                    this.result = {
                        total,
                        detail: res.steps.map((s) => `${names[s.group]} ${this.formatBytes(s.reclaimed)}`).join(" · "),
                    };
                } else {
                    this.$root.toastRes(res);
                }
                this.load();
            });
        },

        visible(group, list) {
            return this.expanded[group] ? list : list.slice(0, LIMIT);
        },

        toggle(group) {
            this.expanded[group] = !this.expanded[group];
        },

        formatBytes(bytes) {
            if (!bytes) {
                return "0 B";
            }
            const units = [ "B", "kB", "MB", "GB", "TB" ];
            let value = bytes;
            let unit = 0;
            while (value >= 1000 && unit < units.length - 1) {
                value /= 1000;
                unit++;
            }
            return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;

    .page-title {
        margin-bottom: 4px;
    }
}

.page-description {
    margin: 0;
    color: var(--text-2);
    max-width: 640px;
}

.head-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

.endpoint-select {
    width: 200px;
}

.groups {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 1100px;
    padding-bottom: 96px;
}

.group {
    padding: 16px 20px;
    background-color: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    transition: opacity 0.15s $ease;

    &.off {
        .item-list,
        .group-figure,
        .more-link {
            opacity: 0.45;
        }
    }
}

.group-head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    .form-switch {
        margin: 0;
        padding-left: 0;
        min-height: 0;

        .form-check-input {
            margin: 0;
            width: 36px;
            height: 20px;
            cursor: pointer;
        }
    }
}

.group-title {
    font-size: 16px;
    line-height: 24px;
    font-weight: 500;
    margin: 0;
    cursor: pointer;
}

.mode {
    margin-left: 4px;

    .mono {
        margin-left: 4px;
        color: var(--text-3);
    }
}

.group-figure {
    margin-left: auto;
    font-size: 16px;
    color: var(--text);
}

.group-description {
    margin: 4px 0 0 48px;
    font-size: 13px;
    color: var(--text-2);
}

.item-list {
    list-style: none;
    margin: 12px 0 0 48px;
    padding: 0;
    border-top: 1px solid var(--hairline);

    li {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 36px;
        padding: 6px 0;
        border-bottom: 1px solid var(--hairline);
        font-size: 13px;
    }
}

.item-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text);
}

.item-meta {
    color: var(--text-3);
    white-space: nowrap;
}

.tag-chip {
    font-size: 12px;
    line-height: 16px;
    padding: 2px 6px;
    border-radius: 6px;
    color: var(--text-2);
    background-color: var(--raised);
    border: 1px solid var(--hairline);
    white-space: nowrap;
}

.more-link {
    margin: 8px 0 0 48px;
    padding: 0;
    font-size: 13px;
    color: var(--text-3);
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--hairline-strong);

    &:hover {
        color: var(--text);
    }
}

.empty {
    margin: 8px 0 0 48px;
    font-size: 13px;
    color: var(--text-3);
}

.loading {
    color: var(--text-2);
}

.result-callout,
.error-callout {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 1100px;
    margin-bottom: 16px;
    padding: 12px 12px 12px 16px;
    border-radius: 14px;
}

.result-callout {
    background-color: var(--accent-soft);

    .btn-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }
}

.result-icon {
    width: 16px;
    height: 16px;
    color: var(--accent-ink);
}

.result-title {
    font-weight: 500;
}

.result-detail {
    font-size: 13px;
    color: var(--text-2);
}

.error-callout {
    border: 1px solid color-mix(in srgb, var(--err) 45%, transparent);
    color: var(--text);

    svg {
        color: var(--err);
    }
}

.action-bar {
    position: sticky;
    bottom: 16px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: 1100px;
    margin-top: -72px;
    padding: 10px 10px 10px 20px;
    background-color: var(--surface);
    border: 1px solid var(--hairline-strong);
    border-radius: 14px;
    box-shadow: var(--shadow-float);

    .btn {
        margin-left: auto;
    }
}

.action-summary {
    display: flex;
    align-items: baseline;
    gap: 10px;
}

.action-figure {
    font-size: 18px;
    font-weight: 500;
}

.action-text {
    color: var(--text-2);
}

.confirm-list {
    margin: 0 0 12px;
    padding-left: 20px;

    li {
        margin-bottom: 4px;
    }
}

.confirm-warning {
    display: flex;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    color: var(--text-2);

    svg {
        width: 14px;
        color: var(--warn);
        flex-shrink: 0;
        margin-top: 3px;
    }
}

@media (max-width: 767px) {
    .page-head {
        flex-direction: column;
    }

    .group-description,
    .item-list,
    .more-link,
    .empty {
        margin-left: 0;
    }
}
</style>
