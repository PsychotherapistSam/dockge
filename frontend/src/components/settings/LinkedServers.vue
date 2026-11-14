<template>
    <div class="settings-stack">
        <SettingsCard :title="$t('linkedServersTitle')" :description="$t('linkedServersHelp')">
            <SettingsRow v-if="loaded && links.length === 0" :label="$t('linkedServersNone')" :description="$t('linkedServersNoneHelp')" />

            <SettingsRow v-for="link in links" :key="link.id" :label="link.name">
                <template #description>
                    <span class="mono">{{ link.url }}</span>
                    <span class="link-meta">· {{ $t("linkedAs", { username: link.username }) }}</span>
                    <span v-if="tests[link.id]" class="link-test" :class="tests[link.id].state">
                        · {{ tests[link.id].text }}
                    </span>
                </template>
                <button class="btn btn-normal btn-sm" type="button" :disabled="tests[link.id]?.state === 'busy'" @click="test(link)">
                    <font-awesome-icon icon="arrows-rotate" :spin="tests[link.id]?.state === 'busy'" />
                    {{ $t("linkTest") }}
                </button>
                <button class="btn btn-normal btn-sm" type="button" @click="remove(link)">
                    {{ $t("linkRemove") }}
                </button>
            </SettingsRow>
        </SettingsCard>

        <form @submit.prevent="add">
            <SettingsCard :title="$t('linkAddTitle')" :description="$t('linkAddHelp')">
                <SettingsRow :label="$t('linkAddress')" :description="$t('linkAddressHelp')" label-for="link-url">
                    <input id="link-url" v-model="form.url" type="url" class="form-control mono" placeholder="http://server2:5001" required spellcheck="false">
                </SettingsRow>
                <SettingsRow :label="$t('linkName')" :description="$t('linkNameHelp')" label-for="link-name">
                    <input id="link-name" v-model="form.name" type="text" class="form-control" :placeholder="$t('linkNamePlaceholder')">
                </SettingsRow>
                <SettingsRow :label="$t('Username')" :description="$t('linkUsernameHelp')" label-for="link-username">
                    <input id="link-username" v-model="form.username" type="text" class="form-control" autocomplete="off" required>
                </SettingsRow>
                <SettingsRow :label="$t('Password')" :description="$t('linkPasswordHelp')" label-for="link-password">
                    <input id="link-password" v-model="form.password" type="password" class="form-control" autocomplete="new-password" required>
                </SettingsRow>
                <template #footer>
                    <button class="btn btn-primary" type="submit" :disabled="adding">
                        <font-awesome-icon v-if="adding" icon="spinner" spin />
                        {{ $t("linkAdd") }}
                    </button>
                </template>
            </SettingsCard>
        </form>
    </div>
</template>

<script>
import SettingsCard from "./SettingsCard.vue";
import SettingsRow from "./SettingsRow.vue";

export default {
    components: {
        SettingsCard,
        SettingsRow,
    },

    data() {
        return {
            loaded: false,
            links: [],
            tests: {},
            adding: false,
            form: {
                url: "",
                name: "",
                username: "",
                password: "",
            },
        };
    },

    mounted() {
        this.load();
    },

    methods: {
        load() {
            this.$root.getSocket().emit("linkedServerList", (res) => {
                if (res.ok) {
                    this.links = res.links;
                    this.loaded = true;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        add() {
            this.adding = true;
            this.$root.getSocket().emit("linkedServerAdd", this.form.url, this.form.username, this.form.password, this.form.name, (res) => {
                this.adding = false;
                this.$root.toastRes(res);
                this.form.password = "";
                if (res.ok) {
                    this.form = {
                        url: "",
                        name: "",
                        username: "",
                        password: "",
                    };
                    this.load();
                }
            });
        },

        test(link) {
            this.tests[link.id] = { state: "busy",
                text: this.$t("linkTesting") };
            this.$root.getSocket().emit("linkedServerTest", link.id, (res) => {
                if (!res.ok) {
                    this.tests[link.id] = { state: "bad",
                        text: res.msg };
                } else if (!res.canReceive) {
                    this.tests[link.id] = { state: "bad",
                        text: this.$t("linkCannotReceive") };
                } else {
                    this.tests[link.id] = { state: "good",
                        text: this.$t("linkWorks", { version: res.version }) };
                }
            });
        },

        remove(link) {
            if (!confirm(this.$t("linkRemoveConfirm", { name: link.name }))) {
                return;
            }
            this.$root.getSocket().emit("linkedServerRemove", link.id, (res) => {
                this.$root.toastRes(res);
                this.load();
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.link-meta {
    margin-left: 4px;
}

.link-test {
    margin-left: 4px;

    &.good {
        color: var(--accent-ink);
    }

    &.bad {
        color: var(--err);
    }
}
</style>
