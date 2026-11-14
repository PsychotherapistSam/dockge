<template>
    <transition ref="tableContainer" name="slide-fade" appear>
        <div v-if="$route.name === 'DashboardHome'" class="home">
            <h1 class="page-title">{{ $t("home") }}</h1>

            <!-- Status board -->
            <section class="board">
                <div class="board-cell">
                    <div class="board-label"><span class="led ok"></span>{{ $t("active") }}</div>
                    <div class="board-figure mono running">{{ activeNum }}</div>
                </div>
                <div class="board-cell">
                    <div class="board-label"><span class="led err"></span>{{ $t("exited") }}</div>
                    <div class="board-figure mono" :class="{ 'has-exited': exitedNum > 0 }">{{ exitedNum }}</div>
                </div>
                <div class="board-cell">
                    <div class="board-label"><span class="led off"></span>{{ $t("inactive") }}</div>
                    <div class="board-figure mono muted">{{ inactiveNum }}</div>
                </div>
                <div class="board-cell" :title="$t('updatesBoardHint')">
                    <div class="board-label"><span class="update-mark"><font-awesome-icon icon="cloud-arrow-down" /></span>{{ $t("updatesBoard") }}</div>
                    <div class="board-figure mono" :class="updatesNum > 0 ? 'running' : 'muted'">{{ updatesNum }}</div>
                </div>
            </section>

            <div class="home-grid">
                <!-- Docker Run -->
                <section class="shadow-box big-padding">
                    <h2 class="section-title">{{ $t("Docker Run") }}</h2>
                    <textarea id="name" v-model="dockerRunCommand" type="text" class="form-control docker-run" required placeholder="docker run ..." rows="5"></textarea>
                    <button class="btn btn-normal mt-3" @click="convertDockerRun">{{ $t("Convert to Compose") }}</button>
                </section>

                <!-- Agent List -->
                <section class="shadow-box big-padding">
                    <h2 class="section-title">{{ $tc("dockgeAgent", 2) }} <span class="title-note">beta</span></h2>

                    <ul class="agent-list">
                        <li v-for="(agentItem, endpoint) in $root.agentList" :key="endpoint" class="agent">
                            <span class="led" :class="agentLedClass(endpoint)" :title="agentStatusText(endpoint)"></span>

                            <span class="agent-name">
                                <template v-if="endpoint === '' && agentItem.name === ''">{{ $t("currentEndpoint") }}</template>
                                <template v-else-if="agentItem.name === ''">{{ endpoint }}</template>
                                <template v-else>{{ agentItem.name }}</template>
                            </span>

                            <span class="agent-status">{{ agentStatusText(endpoint) }}</span>

                            <button v-if="agentItem.name !== ''" type="button" class="btn-icon" :title="$t('Update Name')" @click="showEditAgentNameDialog[agentItem.name] = !showEditAgentNameDialog[agentItem.Name]">
                                <font-awesome-icon icon="pen-to-square" />
                            </button>
                            <button v-if="endpoint !== ''" type="button" class="btn-icon" :title="$t('removeAgent')" @click="showRemoveAgentDialog[agentItem.url] = !showRemoveAgentDialog[agentItem.url]">
                                <font-awesome-icon icon="trash" />
                            </button>

                            <!-- Edit Dialog -->
                            <BModal v-model="showEditAgentNameDialog[agentItem.name]" :no-close-on-backdrop="true" :close-on-esc="true" :okTitle="$t('Update Name')" okVariant="primary" @ok="updateName(agentItem.url, agentItem.updatedName)">
                                <label for="updatedName" class="form-label">Current value: {{ $t(agentItem.name) }}</label>
                                <input id="updatedName" v-model="agentItem.updatedName" type="text" class="form-control" optional>
                            </BModal>

                            <!-- Remove Agent Dialog -->
                            <BModal v-model="showRemoveAgentDialog[agentItem.url]" :okTitle="$t('removeAgent')" okVariant="danger" @ok="removeAgent(agentItem.url)">
                                <p class="mono">{{ agentItem.url }}</p>
                                {{ $t("removeAgentMsg") }}
                            </BModal>
                        </li>
                    </ul>

                    <button v-if="!showAgentForm" class="btn btn-normal" @click="showAgentForm = !showAgentForm">
                        <font-awesome-icon icon="plus" /> {{ $t("addAgent") }}
                    </button>

                    <!-- Add Agent Form -->
                    <form v-if="showAgentForm" class="agent-form" @submit.prevent="addAgent">
                        <div class="mb-3">
                            <label for="url" class="form-label">{{ $t("dockgeURL") }}</label>
                            <input id="url" v-model="agent.url" type="url" class="form-control" required placeholder="http://">
                        </div>

                        <div class="mb-3">
                            <label for="username" class="form-label">{{ $t("Username") }}</label>
                            <input id="username" v-model="agent.username" type="text" class="form-control" required>
                        </div>

                        <div class="mb-3">
                            <label for="password" class="form-label">{{ $t("Password") }}</label>
                            <input id="password" v-model="agent.password" type="password" class="form-control" required autocomplete="new-password">
                        </div>

                        <div class="mb-3">
                            <label for="agentName" class="form-label">{{ $t("Friendly Name") }}</label>
                            <input id="agentName" v-model="agent.name" type="text" class="form-control" optional>
                        </div>

                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary" :disabled="connectingAgent">
                                <template v-if="connectingAgent">{{ $t("connecting") }}</template>
                                <template v-else>{{ $t("connect") }}</template>
                            </button>
                            <button type="button" class="btn btn-normal" @click="showAgentForm = false">{{ $t("cancel") }}</button>
                        </div>
                    </form>
                </section>
            </div>
        </div>
    </transition>
    <router-view ref="child" />
</template>

<script>
import { statusNameShort } from "../../../common/util-common";

export default {
    components: {

    },
    props: {
        calculatedHeight: {
            type: Number,
            default: 0
        }
    },
    data() {
        return {
            page: 1,
            perPage: 25,
            initialPerPage: 25,
            paginationConfig: {
                hideCount: true,
                chunksNavigation: "scroll",
            },
            importantHeartBeatListLength: 0,
            displayedRecords: [],
            dockerRunCommand: "",
            showAgentForm: false,
            showRemoveAgentDialog: {},
            showEditAgentNameDialog: {},
            connectingAgent: false,
            agent: {
                url: "http://",
                username: "",
                password: "",
                name: "",
                updatedName: "",
            }
        };
    },

    computed: {
        activeNum() {
            return this.getStatusNum("active");
        },
        inactiveNum() {
            return this.getStatusNum("inactive");
        },
        exitedNum() {
            return this.getStatusNum("exited");
        },
        /** Stacks with at least one service that has an image update */
        updatesNum() {
            return Object.values(this.$root.completeStackList).filter((stack) => stack.imageUpdateCount > 0).length;
        },
    },

    watch: {
        perPage() {
            this.$nextTick(() => {
                this.getImportantHeartbeatListPaged();
            });
        },

        page() {
            this.getImportantHeartbeatListPaged();
        },
    },

    mounted() {
        this.initialPerPage = this.perPage;

        window.addEventListener("resize", this.updatePerPage);
        this.updatePerPage();
    },

    beforeUnmount() {
        window.removeEventListener("resize", this.updatePerPage);
    },

    methods: {
        agentLedClass(endpoint) {
            const status = this.$root.agentStatusList[endpoint];
            if (status === "online") {
                return "ok";
            } else if (status === "offline") {
                return "err";
            }
            return "off";
        },

        agentStatusText(endpoint) {
            const status = this.$root.agentStatusList[endpoint];
            if (status === "online") {
                return this.$t("agentOnline");
            } else if (status === "offline") {
                return this.$t("agentOffline");
            } else if (status) {
                return this.$t(status);
            }
            return "";
        },

        addAgent() {
            this.connectingAgent = true;
            this.$root.getSocket().emit("addAgent", this.agent, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        url: "http://",
                        username: "",
                        password: "",
                    };
                }

                this.connectingAgent = false;
            });
        },

        removeAgent(url) {
            this.$root.getSocket().emit("removeAgent", url, (res) => {
                if (res.ok) {
                    this.$root.toastRes(res);

                    let urlObj = new URL(url);
                    let endpoint = urlObj.host;

                    // Remove the stack list and status list of the removed agent
                    delete this.$root.allAgentStackList[endpoint];
                }
            });
        },

        updateName(url, updatedName) {
            this.$root.getSocket().emit("updateAgent", url, updatedName, (res) => {
                this.$root.toastRes(res);

                if (res.ok) {
                    this.showAgentForm = false;
                    this.agent = {
                        updatedName: "",
                    };
                }
            });
        },

        getStatusNum(statusName) {
            let num = 0;

            for (let stackName in this.$root.completeStackList) {
                const stack = this.$root.completeStackList[stackName];
                if (statusNameShort(stack.status) === statusName) {
                    num += 1;
                }
            }
            return num;
        },

        convertDockerRun() {
            if (this.dockerRunCommand.trim() === "docker run") {
                throw new Error("Please enter a docker run command");
            }

            // composerize is working in dev, but after "vite build", it is not working
            // So pass to backend to do the conversion
            this.$root.getSocket().emit("composerize", this.dockerRunCommand, (res) => {
                if (res.ok) {
                    this.$root.composeTemplate = res.composeTemplate;
                    this.$router.push("/compose");
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        /**
         * Updates the displayed records when a new important heartbeat arrives.
         * @param {object} heartbeat - The heartbeat object received.
         * @returns {void}
         */
        onNewImportantHeartbeat(heartbeat) {
            if (this.page === 1) {
                this.displayedRecords.unshift(heartbeat);
                if (this.displayedRecords.length > this.perPage) {
                    this.displayedRecords.pop();
                }
                this.importantHeartBeatListLength += 1;
            }
        },

        /**
         * Retrieves the length of the important heartbeat list for all monitors.
         * @returns {void}
         */
        getImportantHeartbeatListLength() {
            this.$root.getSocket().emit("monitorImportantHeartbeatListCount", null, (res) => {
                if (res.ok) {
                    this.importantHeartBeatListLength = res.count;
                    this.getImportantHeartbeatListPaged();
                }
            });
        },

        /**
         * Retrieves the important heartbeat list for the current page.
         * @returns {void}
         */
        getImportantHeartbeatListPaged() {
            const offset = (this.page - 1) * this.perPage;
            this.$root.getSocket().emit("monitorImportantHeartbeatListPaged", null, offset, this.perPage, (res) => {
                if (res.ok) {
                    this.displayedRecords = res.data;
                }
            });
        },

        /**
         * Updates the number of items shown per page based on the available height.
         * @returns {void}
         */
        updatePerPage() {
            const tableContainer = this.$refs.tableContainer;
            const tableContainerHeight = tableContainer.offsetHeight;
            const availableHeight = window.innerHeight - tableContainerHeight;
            const additionalPerPage = Math.floor(availableHeight / 58);

            if (additionalPerPage > 0) {
                this.perPage = Math.max(this.initialPerPage, this.perPage + additionalPerPage);
            } else {
                this.perPage = this.initialPerPage;
            }

        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars";

.page-title {
    margin-bottom: 24px;
}

.board {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    background-color: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    margin-bottom: 24px;
}

.board-cell {
    padding: 20px 24px;

    & + & {
        border-left: 1px solid var(--hairline);
    }
}

.board-label {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-2);
    margin-bottom: 12px;
}

.board-figure {
    font-size: 32px;
    line-height: 1;
    font-weight: 500;
    color: var(--text);

    &.running {
        color: var(--accent-ink);
    }

    &.has-exited {
        color: var(--err);
    }

    &.muted {
        color: var(--text-2);
    }
}

.home-grid {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 24px;
    align-items: start;
}

.section-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 16px;
    line-height: 24px;
    margin-bottom: 16px;
}

.title-note {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-3);
}

.docker-run {
    font-family: $font-family-monospace;
    font-size: 13px;
    line-height: 20px;
    resize: vertical;
}

.agent-list {
    list-style: none;
    margin: 0 0 16px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.agent {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
}

.agent-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.agent-status {
    font-size: 13px;
    color: var(--text-3);
}

.btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    svg {
        width: 14px;
    }
}

.agent-form {
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
}

.form-actions {
    display: flex;
    gap: 8px;
}

@media (max-width: 991px) {
    .home-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 767px) {
    .board {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .board-cell:nth-child(3) {
        border-left: 0;
    }

    .board-cell:nth-child(n+3) {
        border-top: 1px solid var(--hairline);
    }
}

@media (max-width: 550px) {
    .board-cell {
        padding: 12px;
    }

    .board-label {
        font-size: 13px;
    }

    .board-figure {
        font-size: 28px;
    }
}
</style>
