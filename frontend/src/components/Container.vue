<template>
    <div class="shadow-box mb-3 container-card">
        <div class="card-head">
            <span class="led" :class="ledClass" :title="status"></span>
            <h3 class="service-name">{{ name }}</h3>
            <span v-if="!isEditMode" class="service-status">{{ status }}</span>

            <div v-if="!isEditMode" class="card-actions">
                <router-link v-if="status === 'running' || status === 'healthy'" class="btn-icon" :to="terminalRouteLink" :title="'Bash'">
                    <font-awesome-icon icon="terminal" />
                </router-link>
                <button
                    v-if="serviceCount > 1 && status !== 'running' && status !== 'healthy'"
                    type="button" class="btn-icon" :title="$t('startStack')" :disabled="processing"
                    @click="startService"
                >
                    <font-awesome-icon icon="play" />
                </button>
                <button
                    v-if="serviceCount > 1 && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                    type="button" class="btn-icon" :title="$t('restartStack')" :disabled="processing"
                    @click="restartService"
                >
                    <font-awesome-icon icon="rotate" />
                </button>
                <button
                    v-if="serviceCount > 1 && (status === 'running' || status === 'healthy' || status === 'unhealthy')"
                    type="button" class="btn-icon" :title="$t('stopStack')" :disabled="processing"
                    @click="stopService"
                >
                    <font-awesome-icon icon="stop" />
                </button>
            </div>
        </div>

        <div class="image mono">
            {{ imageName }}<span class="tag">:{{ imageTag }}</span>
        </div>

        <div v-if="imageUpdate && !isEditMode && hasImageUpdateInfo" class="image-update">
            <span
                v-if="imageUpdate.digestUpdate"
                class="update-mark digest-update"
                :title="$t('imageDigestUpdateTitle', { tag: imageTag })"
            >
                <font-awesome-icon icon="cloud-arrow-down" />{{ $t("imageUpdateAvailable") }}
            </span>
            <span v-if="imageUpdate.newTags.length > 0" class="new-tags">
                <span class="new-tags-label">{{ $t("newTags") }}</span>
                <span v-for="tag in visibleNewTags" :key="tag" class="tag-chip mono">{{ tag }}</span>
                <a v-if="!showAllTags && hiddenTagCount > 0" href="#" class="more-link" @click.prevent="showAllTags = true">{{ $t("andMore", { n: hiddenTagCount }) }}</a>
                <a v-else-if="showAllTags" href="#" class="more-link" @click.prevent="showAllTags = false">{{ $t("showLess") }}</a>
            </span>
            <span v-if="imageUpdate.status === 'error'" class="check-error" :title="imageUpdate.message">
                <font-awesome-icon icon="exclamation-circle" />{{ $t("imageUpdateCheckFailed") }}
            </span>
        </div>

        <div v-if="!isEditMode && (ports ?? envsubstService.ports)?.length" class="ports">
            <a v-for="port in (ports ?? envsubstService.ports)" :key="port" :href="parsePort(port).url" target="_blank" rel="noopener" class="port mono">
                {{ parsePort(port).display }}
            </a>
        </div>

        <div v-if="isEditMode" class="edit-actions">
            <button class="btn btn-sm btn-normal" @click="showConfig = !showConfig">
                <font-awesome-icon icon="edit" />
                {{ $t("Edit") }}
            </button>
            <button class="btn btn-sm btn-danger" @click="remove">
                <font-awesome-icon icon="trash" />
                {{ $t("deleteContainer") }}
            </button>
        </div>
        <div v-else-if="statsInstances.length > 0" class="stats-row">
            <div class="stats-line">
                <template v-if="!expandedStats">
                    <span class="stats"><span class="stats-label">{{ $t('CPU') }}</span> <span class="mono">{{ statsInstances[0].CPUPerc }}</span></span>
                    <span class="stats"><span class="stats-label">{{ $t('memoryAbbreviated') }}</span> <span class="mono">{{ statsInstances[0].MemUsage }}</span></span>
                </template>
                <button type="button" class="btn-icon ms-auto" :title="expandedStats ? $t('showLess') : $t('showMore')" @click="expandedStats = !expandedStats">
                    <font-awesome-icon :icon="expandedStats ? 'chevron-up' : 'chevron-down'" />
                </button>
            </div>
            <transition name="slide-fade" appear>
                <div v-if="expandedStats" class="d-flex flex-column gap-3 mt-2">
                    <DockerStat
                        v-for="stat in statsInstances"
                        :key="stat.Name"
                        :stat="stat"
                    />
                </div>
            </transition>
        </div>

        <transition name="slide-fade" appear>
            <div v-if="isEditMode && showConfig" class="config mt-3">
                <!-- Image -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dockerImage") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.image"
                            class="form-control"
                            list="image-datalist"
                        />
                    </div>

                    <!-- TODO: Search online: https://hub.docker.com/api/content/v1/products/search?q=louislam%2Fuptime&source=community&page=1&page_size=4 -->
                    <datalist id="image-datalist">
                        <option value="louislam/uptime-kuma:1" />
                    </datalist>
                    <div class="form-text"></div>
                </div>

                <!-- Ports -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("port", 2) }}
                    </label>
                    <ArrayInput name="ports" :display-name="$t('port')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Volumes -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("volume", 2) }}
                    </label>
                    <ArrayInput name="volumes" :display-name="$t('volume')" placeholder="HOST:CONTAINER" />
                </div>

                <!-- Restart Policy -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("restartPolicy") }}
                    </label>
                    <select v-model="service.restart" class="form-select">
                        <option value="always">{{ $t("restartPolicyAlways") }}</option>
                        <option value="unless-stopped">{{ $t("restartPolicyUnlessStopped") }}</option>
                        <option value="on-failure">{{ $t("restartPolicyOnFailure") }}</option>
                        <option value="no">{{ $t("restartPolicyNo") }}</option>
                    </select>
                </div>

                <!-- Environment Variables -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("environmentVariable", 2) }}
                    </label>
                    <ArrayInput name="environment" :display-name="$t('environmentVariable')" placeholder="KEY=VALUE" />
                </div>

                <!-- Container Name -->
                <div v-if="false" class="mb-4">
                    <label class="form-label">
                        {{ $t("containerName") }}
                    </label>
                    <div class="input-group mb-3">
                        <input
                            v-model="service.container_name"
                            class="form-control"
                        />
                    </div>
                    <div class="form-text"></div>
                </div>

                <!-- Network -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $tc("network", 2) }}
                    </label>

                    <div v-if="networkList.length === 0 && service.networks && service.networks.length > 0" class="text-warning mb-3">
                        {{ $t("NoNetworksAvailable") }}
                    </div>

                    <ArraySelect name="networks" :display-name="$t('network')" placeholder="Network Name" :options="networkList" />
                </div>

                <!-- Depends on -->
                <div class="mb-4">
                    <label class="form-label">
                        {{ $t("dependsOn") }}
                    </label>
                    <ArrayInput name="depends_on" :display-name="$t('dependsOn')" :placeholder="$t(`containerName`)" />
                </div>
            </div>
        </transition>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { parseDockerPort } from "../../../common/util-common";
import DockerStat from "./DockerStat.vue";

export default defineComponent({
    components: {
        FontAwesomeIcon,
        DockerStat
    },
    props: {
        name: {
            type: String,
            required: true,
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
        first: {
            type: Boolean,
            default: false,
        },
        serviceStatus: {
            type: Object,
            default: null,
        },
        dockerStats: {
            type: Object,
            default: null
        },
        imageUpdate: {
            type: Object,
            default: null
        }
    },
    emits: [
        "start-service",
        "stop-service",
        "restart-service"
    ],
    data() {
        return {
            showConfig: false,
            expandedStats: false,
            showAllTags: false,
        };
    },
    computed: {

        hasImageUpdateInfo() {
            return this.imageUpdate.digestUpdate || this.imageUpdate.newTags.length > 0 || this.imageUpdate.status === "error";
        },

        visibleNewTags() {
            return this.showAllTags ? this.imageUpdate.newTags : this.imageUpdate.newTags.slice(0, 5);
        },

        hiddenTagCount() {
            return this.imageUpdate.newTagCount - this.visibleNewTags.length;
        },

        networkList() {
            let list = [];
            for (const networkName in this.jsonObject.networks) {
                list.push(networkName);
            }
            return list;
        },

        ledClass() {
            if (this.status === "running" || this.status === "healthy") {
                return "ok";
            } else if (this.status === "unhealthy" || this.status === "exited" || this.status === "dead") {
                return "err";
            } else if (this.status === "restarting" || this.status === "starting" || this.status === "paused") {
                return "warn";
            } else {
                return "off";
            }
        },

        terminalRouteLink() {
            if (this.endpoint) {
                return {
                    name: "containerTerminalEndpoint",
                    params: {
                        endpoint: this.endpoint,
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            } else {
                return {
                    name: "containerTerminal",
                    params: {
                        stackName: this.stackName,
                        serviceName: this.name,
                        type: "bash",
                    },
                };
            }
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        stackName() {
            return this.$parent.$parent.stack.name;
        },

        service() {
            if (!this.jsonObject.services[this.name]) {
                return {};
            }
            return this.jsonObject.services[this.name];
        },

        serviceCount() {
            return Object.keys(this.jsonObject.services).length;
        },

        jsonObject() {
            return this.$parent.$parent.jsonConfig;
        },

        envsubstJSONConfig() {
            return this.$parent.$parent.envsubstJSONConfig;
        },

        envsubstService() {
            if (!this.envsubstJSONConfig.services[this.name]) {
                return {};
            }
            return this.envsubstJSONConfig.services[this.name];
        },

        imageName() {
            if (this.envsubstService.image) {
                return this.envsubstService.image.split(":")[0];
            } else {
                return "";
            }
        },

        imageTag() {
            if (this.envsubstService.image) {
                let tag = this.envsubstService.image.split(":")[1];

                if (tag) {
                    return tag;
                } else {
                    return "latest";
                }
            } else {
                return "";
            }
        },
        statsInstances() {
            if (!this.serviceStatus) {
                return [];
            }

            return this.serviceStatus
                .map(s => this.dockerStats[s.name])
                .filter(s => !!s)
                .sort((a, b) => a.Name.localeCompare(b.Name));
        },
        status() {
            if (!this.serviceStatus) {
                return "N/A";
            }
            return this.serviceStatus[0].status;
        }
    },
    mounted() {
        if (this.first) {
            //this.showConfig = true;
        }
    },
    methods: {
        parsePort(port) {
            if (this.stack.endpoint) {
                return parseDockerPort(port, this.stack.primaryHostname);
            } else {
                let hostname = this.$root.info.primaryHostname || location.hostname;
                return parseDockerPort(port, hostname);
            }
        },
        remove() {
            delete this.jsonObject.services[this.name];
        },
        startService() {
            this.$emit("start-service", this.name);
        },
        stopService() {
            this.$emit("stop-service", this.name);
        },
        restartService() {
            this.$emit("restart-service", this.name);
        }

    }
});
</script>

<style scoped lang="scss">
@import "../styles/vars";

.container-card {
    padding: 16px 20px;
}

.card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
}

.service-name {
    font-size: 16px;
    line-height: 24px;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.service-status {
    font-size: 13px;
    color: var(--text-3);
}

.card-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;

    .btn-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;

        svg {
            width: 14px;
        }
    }
}

.image {
    margin-top: 4px;
    padding-left: 18px;
    font-size: 12px;
    line-height: 16px;
    color: var(--text-2);
    overflow-wrap: anywhere;

    .tag {
        color: var(--text-3);
    }
}

.image-update {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin-top: 12px;
    padding-left: 18px;
    font-size: 13px;
    color: var(--text-2);
}

.digest-update,
.check-error {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.digest-update {
    font-size: 13px;
    gap: 6px;
}

.check-error {
    color: var(--err);

    svg {
        width: 13px;
    }
}

.new-tags {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.new-tags-label {
    color: var(--text-3);
    margin-right: 2px;
}

.tag-chip {
    font-size: 12px;
    line-height: 16px;
    padding: 2px 6px;
    border-radius: 6px;
    color: var(--text);
    background-color: var(--raised);
    border: 1px solid var(--hairline);
}

.more-link {
    font-size: 12px;
    color: var(--text-3);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--hairline-strong);

    &:hover {
        color: var(--text);
    }
}

.ports {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
    padding-left: 18px;
}

.port {
    font-size: 12px;
    line-height: 16px;
    padding: 2px 6px;
    border-radius: 6px;
    color: var(--accent-ink);
    border: 1px solid var(--hairline);
    text-decoration: none;
    transition: border-color 0.15s $ease, background-color 0.15s $ease;

    &:hover {
        border-color: var(--hairline-strong);
        background-color: var(--raised);
    }
}

.edit-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.stats-row {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--hairline);
}

.stats-line {
    display: flex;
    align-items: center;
    gap: 16px;
    padding-left: 18px;

    .btn-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;

        svg {
            width: 12px;
        }
    }
}

.stats {
    white-space: nowrap;
    font-size: 12px;
    color: var(--text-2);
}

.stats-label {
    color: var(--text-3);
}

.config {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
}
</style>
