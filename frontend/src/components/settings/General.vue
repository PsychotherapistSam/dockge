<template>
    <div>
        <form class="my-4" autocomplete="off" @submit.prevent="saveGeneral">
            <!-- Client side Timezone -->
            <div v-if="false" class="mb-4">
                <label for="timezone" class="form-label">
                    {{ $t("Display Timezone") }}
                </label>
                <select id="timezone" v-model="$root.userTimezone" class="form-select">
                    <option value="auto">
                        {{ $t("Auto") }}: {{ guessTimezone }}
                    </option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <!-- Server Timezone -->
            <div v-if="false" class="mb-4">
                <label for="timezone" class="form-label">
                    {{ $t("Server Timezone") }}
                </label>
                <select id="timezone" v-model="settings.serverTimezone" class="form-select">
                    <option value="UTC">UTC</option>
                    <option
                        v-for="(timezone, index) in timezoneList"
                        :key="index"
                        :value="timezone.value"
                    >
                        {{ timezone.name }}
                    </option>
                </select>
            </div>

            <!-- Primary Hostname -->
            <div class="mb-4">
                <label class="form-label" for="primaryBaseURL">
                    {{ $t("primaryHostname") }}
                </label>

                <div class="input-group mb-3">
                    <input
                        v-model="settings.primaryHostname"
                        class="form-control"
                        :placeholder="$t(`CurrentHostname`)"
                    />
                    <button class="btn btn-outline-primary" type="button" @click="autoGetPrimaryHostname">
                        {{ $t("autoGet") }}
                    </button>
                </div>

                <div class="form-text"></div>
            </div>

            <!-- Image update check -->
            <div class="mb-4">
                <label class="form-label">{{ $t("imageUpdates") }}</label>
                <div class="form-check form-switch mb-2">
                    <input id="imageUpdateCheck" v-model="imageUpdateCheckEnabled" class="form-check-input" type="checkbox">
                    <label class="form-check-label" for="imageUpdateCheck">{{ $t("imageUpdateCheckSetting") }}</label>
                </div>
                <div v-if="imageUpdateCheckEnabled" class="form-check form-switch mb-2">
                    <input id="imageUpdateWatchTags" v-model="settings.imageUpdateWatchTags" class="form-check-input" type="checkbox">
                    <label class="form-check-label" for="imageUpdateWatchTags">{{ $t("imageUpdateWatchTagsSetting") }}</label>
                </div>
                <div v-if="imageUpdateCheckEnabled" class="input-group mb-2" style="max-width: 360px;">
                    <span class="input-group-text">{{ $t("imageUpdateCheckInterval") }}</span>
                    <input v-model.number="imageUpdateCheckInterval" type="number" min="0.25" step="0.25" class="form-control">
                </div>
                <button class="btn btn-normal btn-sm" type="button" :disabled="checkingAll" @click="checkAllNow">
                    <font-awesome-icon icon="arrows-rotate" :spin="checkingAll" class="me-1" />
                    {{ $t("checkAllImageUpdates") }}
                </button>
                <div class="form-text">{{ $t("imageUpdateCheckHelp") }}</div>
            </div>

            <!-- Save Button -->
            <div>
                <button class="btn btn-primary" type="submit">
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>

import dayjs from "dayjs";
import { timezoneList } from "../../util-frontend";

export default {
    components: {

    },

    data() {
        return {
            timezoneList: timezoneList(),
            checkingAll: false,
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
        },
        guessTimezone() {
            return dayjs.tz.guess();
        },
        // Enabled unless explicitly turned off
        imageUpdateCheckEnabled: {
            get() {
                return this.settings.imageUpdateCheck !== false;
            },
            set(value) {
                this.settings.imageUpdateCheck = value;
            },
        },
        imageUpdateCheckInterval: {
            get() {
                return this.settings.imageUpdateCheckInterval ?? 6;
            },
            set(value) {
                this.settings.imageUpdateCheckInterval = value;
            },
        },
    },

    methods: {
        /** Save the settings */
        saveGeneral() {
            localStorage.timezone = this.$root.userTimezone;
            this.saveSettings();
        },
        /** Run the image update check for every stack on this server now */
        checkAllNow() {
            this.checkingAll = true;
            this.$root.emitAgent("", "checkImageUpdates", null, (res) => {
                this.checkingAll = false;
                this.$root.toastRes(res);
            });
        },
        /** Get the base URL of the application */
        autoGetPrimaryHostname() {
            this.settings.primaryHostname = location.hostname;
        },
    },
};
</script>

