<template>
    <div class="settings-stack">
        <SettingsCard :title="$t('registriesSignedIn')" :description="$t('registriesHelp')">
            <SettingsRow v-if="loaded && logins.length === 0" :label="$t('registriesNone')" :description="$t('registriesNoneHelp')" />

            <SettingsRow
                v-for="login in logins"
                :key="login.server"
                :label="login.registry"
                :description="login.username ? $t('registrySignedInAs', { username: login.username }) : $t('registryStoredInHelper')"
            >
                <button class="btn btn-normal btn-sm" type="button" :disabled="busy === login.server" @click="logout(login)">
                    <font-awesome-icon icon="sign-out-alt" />
                    {{ $t("registrySignOut") }}
                </button>
            </SettingsRow>

            <template v-if="credsStore || dir" #footer>
                <div class="config-note">
                    <font-awesome-icon icon="info-circle" />
                    <span>
                        {{ $t("registryConfigLocation") }} <code>{{ dir }}</code>
                        <template v-if="credsStore"> · {{ $t("registryUsesHelper") }} <code>docker-credential-{{ credsStore }}</code></template>
                    </span>
                </div>
            </template>
        </SettingsCard>

        <form @submit.prevent="login">
            <SettingsCard :title="$t('registrySignInTitle')" :description="$t('registrySignInHelp')">
                <SettingsRow :label="$t('registryLabel')" :description="$t('registryLabelHelp')" label-for="registry-server">
                    <input id="registry-server" v-model="form.registry" type="text" class="form-control mono" placeholder="ghcr.io" autocomplete="off" spellcheck="false">
                </SettingsRow>
                <SettingsRow :label="$t('Username')" label-for="registry-username">
                    <input id="registry-username" v-model="form.username" type="text" class="form-control" autocomplete="off" required>
                </SettingsRow>
                <SettingsRow :label="$t('registryPassword')" :description="$t('registryPasswordHelp')" label-for="registry-password">
                    <input id="registry-password" v-model="form.password" type="password" class="form-control" autocomplete="new-password" required>
                </SettingsRow>
                <template #footer>
                    <button class="btn btn-primary" type="submit" :disabled="busy === 'login'">
                        <font-awesome-icon v-if="busy === 'login'" icon="spinner" spin />
                        {{ $t("registrySignIn") }}
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
            logins: [],
            credsStore: "",
            dir: "",
            busy: "",
            form: {
                registry: "",
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
            this.$root.getSocket().emit("getRegistryLogins", (res) => {
                if (res.ok) {
                    this.logins = res.logins;
                    this.credsStore = res.credsStore || "";
                    this.dir = res.dir;
                    this.loaded = true;
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        login() {
            this.busy = "login";
            this.$root.getSocket().emit("registryLogin", this.form.registry, this.form.username, this.form.password, (res) => {
                this.busy = "";
                this.$root.toastRes(res);
                if (res.ok) {
                    this.form = {
                        registry: "",
                        username: "",
                        password: "",
                    };
                    this.load();
                } else {
                    // Keep the registry and username, clear the secret
                    this.form.password = "";
                }
            });
        },

        logout(login) {
            this.busy = login.server;
            this.$root.getSocket().emit("registryLogout", login.server, (res) => {
                this.busy = "";
                this.$root.toastRes(res);
                this.load();
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.config-note {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    font-size: 13px;
    color: var(--text-2);

    svg {
        width: 13px;
        color: var(--text-3);
        flex-shrink: 0;
    }

    code {
        font-size: 12px;
    }
}
</style>
