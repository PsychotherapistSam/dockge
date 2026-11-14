<template>
    <div>
        <div v-if="settingsLoaded" class="settings-stack">
            <SettingsCard v-if="!settings.disableAuth" :title="$t('settingsAccount')">
                <SettingsRow :label="$root.username" :description="$t('Current User')">
                    <button id="logout-btn" class="btn btn-danger" @click="$root.logout">
                        <font-awesome-icon icon="sign-out-alt" />
                        {{ $t("Logout") }}
                    </button>
                </SettingsRow>
            </SettingsCard>

            <form v-if="!settings.disableAuth" @submit.prevent="savePassword">
                <SettingsCard :title="$t('Change Password')">
                    <SettingsRow :label="$t('Current Password')" label-for="current-password">
                        <input
                            id="current-password"
                            v-model="password.currentPassword"
                            type="password"
                            class="form-control"
                            autocomplete="current-password"
                            required
                        />
                    </SettingsRow>
                    <SettingsRow :label="$t('New Password')" label-for="new-password">
                        <input
                            id="new-password"
                            v-model="password.newPassword"
                            type="password"
                            class="form-control"
                            autocomplete="new-password"
                            required
                        />
                    </SettingsRow>
                    <SettingsRow :label="$t('Repeat New Password')" label-for="repeat-new-password">
                        <template v-if="invalidPassword" #description>
                            <span class="text-danger">{{ $t("passwordNotMatchMsg") }}</span>
                        </template>
                        <input
                            id="repeat-new-password"
                            v-model="password.repeatNewPassword"
                            type="password"
                            class="form-control"
                            :class="{ 'is-invalid': invalidPassword }"
                            autocomplete="new-password"
                            required
                        />
                    </SettingsRow>
                    <template #footer>
                        <button class="btn btn-primary" type="submit">
                            {{ $t("Update Password") }}
                        </button>
                    </template>
                </SettingsCard>
            </form>

            <!-- TODO: Hidden for now -->
            <SettingsCard v-if="! settings.disableAuth && false" :title="$t('Two Factor Authentication')">
                <SettingsRow :label="$t('2FA Settings')">
                    <button class="btn btn-normal" type="button" @click="$refs.TwoFADialog.show()">
                        {{ $t("2FA Settings") }}
                    </button>
                </SettingsRow>
            </SettingsCard>

            <SettingsCard :title="$t('Advanced')">
                <SettingsRow
                    :label="settings.disableAuth ? $t('Enable Auth') : $t('Disable Auth')"
                    :description="settings.disableAuth ? $t('enableAuthHelp') : $t('disableAuthHelp')"
                >
                    <button v-if="settings.disableAuth" id="enableAuth-btn" class="btn btn-normal" @click="enableAuth">{{ $t("Enable Auth") }}</button>
                    <button v-if="! settings.disableAuth" id="disableAuth-btn" class="btn btn-normal" @click="confirmDisableAuth">{{ $t("Disable Auth") }}</button>
                </SettingsRow>
            </SettingsCard>
        </div>

        <TwoFADialog ref="TwoFADialog" />

        <Confirm ref="confirmDisableAuth" btn-style="btn-danger" :yes-text="$t('I understand, please disable')" :no-text="$t('Leave')" @yes="disableAuth">
            <i18n-t keypath="disableauth.message1" tag="p">
                <template #disableAuth>
                    <strong>{{ $t('disableAuth') }}</strong>
                </template>
            </i18n-t>

            <i18n-t keypath="disableauth.message2" tag="p">
                <template #scenarios>
                    <strong>{{ $t('scenarios') }}</strong>
                </template>
            </i18n-t>

            <p>{{ $t("Please use this option carefully!") }}</p>

            <div class="mb-3">
                <label for="current-password2" class="form-label">
                    {{ $t("Current Password") }}
                </label>
                <input
                    id="current-password2"
                    v-model="password.currentPassword"
                    type="password"
                    class="form-control"
                    required
                />
            </div>
        </Confirm>
    </div>
</template>

<script>
import SettingsCard from "./SettingsCard.vue";
import SettingsRow from "./SettingsRow.vue";
import Confirm from "../../components/Confirm.vue";
import TwoFADialog from "../../components/TwoFADialog.vue";

export default {
    components: {
        Confirm,
        TwoFADialog,
        SettingsCard,
        SettingsRow,
    },

    data() {
        return {
            invalidPassword: false,
            password: {
                currentPassword: "",
                newPassword: "",
                repeatNewPassword: "",
            }
        };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        }
    },

    watch: {
        "password.repeatNewPassword"() {
            this.invalidPassword = false;
        },
    },

    methods: {
        /** Check new passwords match before saving them */
        savePassword() {
            if (this.password.newPassword !== this.password.repeatNewPassword) {
                this.invalidPassword = true;
            } else {
                this.$root
                    .getSocket()
                    .emit("changePassword", this.password, (res) => {
                        this.$root.toastRes(res);
                        if (res.ok) {
                            this.password.currentPassword = "";
                            this.password.newPassword = "";
                            this.password.repeatNewPassword = "";
                        }
                    });
            }
        },

        /** Disable authentication for web app access */
        disableAuth() {
            this.settings.disableAuth = true;

            // Need current password to disable auth
            // Set it to empty if done
            this.saveSettings(() => {
                this.password.currentPassword = "";
                this.$root.username = null;
                this.$root.socketIO.token = "autoLogin";
            }, this.password.currentPassword);
        },

        /** Enable authentication for web app access */
        enableAuth() {
            this.settings.disableAuth = false;
            this.saveSettings();
            this.$root.storage().removeItem("token");
            location.reload();
        },

        /** Show confirmation dialog for disable auth */
        confirmDisableAuth() {
            this.$refs.confirmDisableAuth.show();
        },

    },
};
</script>
