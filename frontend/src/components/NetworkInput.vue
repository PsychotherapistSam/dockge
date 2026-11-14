<template>
    <div>
        <div class="form-label">{{ $t("Internal Networks") }}</div>
        <div class="list-editor">
            <div v-for="(networkRow, index) in networkList" :key="index" class="list-editor-row">
                <input v-model="networkRow.key" type="text" class="form-control" :placeholder="$t(`Network name...`)" :aria-label="$t('Internal Networks')" spellcheck="false" />
                <button type="button" class="btn-icon list-editor-remove" :title="$t('Remove')" @click="remove(index)">
                    <font-awesome-icon icon="times" />
                </button>
            </div>
            <button type="button" class="list-editor-add" @click="addField">
                <font-awesome-icon icon="plus" />
                {{ $t("addInternalNetwork") }}
            </button>
        </div>

        <div class="form-label mt-4">{{ $t("External Networks") }}</div>

        <div v-if="externalNetworkList.length === 0" class="list-editor-note">
            {{ $t("No External Networks") }}
        </div>

        <div v-for="(networkName, index) in externalNetworkList" :key="networkName" class="form-check form-switch mb-2">
            <input :id=" 'external-network' + index" v-model="selectedExternalList[networkName]" class="form-check-input" type="checkbox">
            <label class="form-check-label mono" :for=" 'external-network' +index">
                {{ networkName }}
            </label>
        </div>

        <div v-if="false" class="input-group mb-3">
            <input
                placeholder="New external network name..."
                class="form-control"
                @keyup.enter="createExternelNetwork"
            />
            <button class="btn btn-normal btn-sm  me-2" type="button">
                {{ $t("createExternalNetwork") }}
            </button>
        </div>

        <div v-if="false">
            <button class="btn btn-primary btn-sm mt-3 me-2" @click="applyToYAML">{{ $t("applyToYAML") }}</button>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            networkList: [],
            externalList: {},
            selectedExternalList: {},
            externalNetworkList: [],
        };
    },
    computed: {
        jsonConfig() {
            return this.$parent.$parent.jsonConfig;
        },

        stack() {
            return this.$parent.$parent.stack;
        },

        editorFocus() {
            return this.$parent.$parent.editorFocus;
        },

        endpoint() {
            return this.$parent.$parent.endpoint;
        },
    },
    watch: {
        "jsonConfig.networks": {
            handler() {
                if (this.editorFocus) {
                    console.debug("jsonConfig.networks changed");
                    this.loadNetworkList();
                }
            },
            deep: true,
        },

        "selectedExternalList": {
            handler() {
                for (const networkName in this.selectedExternalList) {
                    const enable = this.selectedExternalList[networkName];

                    if (enable) {
                        if (!this.externalList[networkName]) {
                            this.externalList[networkName] = {};
                        }
                        this.externalList[networkName].external = true;
                    } else {
                        delete this.externalList[networkName];
                    }
                }
                this.applyToYAML();
            },
            deep: true,
        },

        "networkList": {
            handler() {
                this.applyToYAML();
            },
            deep: true,
        }

    },
    mounted() {
        this.loadNetworkList();
        this.loadExternalNetworkList();
    },
    methods: {
        loadNetworkList() {
            this.networkList = [];
            this.externalList = {};

            for (const key in this.jsonConfig.networks) {
                let obj = {
                    key: key,
                    value: this.jsonConfig.networks[key],
                };

                if (obj.value && obj.value.external) {
                    this.externalList[key] = Object.assign({}, obj.value);
                } else {
                    this.networkList.push(obj);
                }
            }

            // Restore selectedExternalList
            this.selectedExternalList = {};
            for (const networkName in this.externalList) {
                this.selectedExternalList[networkName] = true;
            }
        },

        loadExternalNetworkList() {
            this.$root.emitAgent(this.endpoint, "getDockerNetworkList", (res) => {
                if (res.ok) {
                    this.externalNetworkList = res.dockerNetworkList.filter((n) => {
                        // Filter out this stack networks
                        if (n.startsWith(this.stack.name + "_")) {
                            return false;
                        }
                        // They should be not supported.
                        // https://docs.docker.com/compose/compose-file/06-networks/#host-or-none
                        if (n === "none" || n === "host" || n === "bridge") {
                            return false;
                        }
                        return true;
                    });
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        addField() {
            this.networkList.push({
                key: "",
                value: {},
            });
        },

        remove(index) {
            this.networkList.splice(index, 1);
            this.applyToYAML();
        },

        applyToYAML() {
            if (this.editorFocus) {
                return;
            }

            this.jsonConfig.networks = {};

            // Internal networks
            for (const networkRow of this.networkList) {
                this.jsonConfig.networks[networkRow.key] = networkRow.value;
            }

            // External networks
            for (const networkName in this.externalList) {
                this.jsonConfig.networks[networkName] = this.externalList[networkName];
            }

            console.debug("applyToYAML", this.jsonConfig.networks);
        }

    },
};
</script>
