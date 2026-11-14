<template>
    <div class="settings-stack">
        <SettingsCard :title="$t('settingsNetwork')">
            <SettingsRow :label="$t('primaryHostname')" :description="$t('primaryHostnameHelp')" label-for="primaryBaseURL">
                <div class="input-group">
                    <input
                        id="primaryBaseURL"
                        v-model="settings.primaryHostname"
                        class="form-control"
                        :placeholder="$t(`CurrentHostname`)"
                    />
                    <button class="btn btn-normal" type="button" @click="autoGetPrimaryHostname">
                        {{ $t("autoGet") }}
                    </button>
                </div>
            </SettingsRow>
        </SettingsCard>

        <SettingsCard :title="$t('imageUpdates')" :description="$t('imageUpdateCardHelp')">
            <SettingsRow :label="$t('imageUpdateAutoLabel')" :description="$t('imageUpdateCheckSetting')" label-for="imageUpdateCheck">
                <div class="form-check form-switch">
                    <input id="imageUpdateCheck" v-model="imageUpdateCheckEnabled" class="form-check-input" type="checkbox" role="switch">
                </div>
            </SettingsRow>

            <SettingsRow v-if="imageUpdateCheckEnabled" :label="$t('imageUpdateCheckInterval')" :description="$t('imageUpdateIntervalHelp')" label-for="imageUpdateInterval">
                <div class="input-group interval-group">
                    <input id="imageUpdateInterval" v-model.number="imageUpdateCheckInterval" type="number" min="0.25" step="0.25" class="form-control mono">
                    <span class="input-group-text">{{ $t("hoursUnit") }}</span>
                </div>
            </SettingsRow>

            <SettingsRow :label="$t('imageUpdateWatchTagsLabel')" label-for="imageUpdateWatchTags">
                <template #description>
                    {{ $t("imageUpdateWatchTagsSetting") }} <code>dockge.update.watch_tags=true</code>
                </template>
                <div class="form-check form-switch">
                    <input id="imageUpdateWatchTags" v-model="settings.imageUpdateWatchTags" class="form-check-input" type="checkbox" role="switch">
                </div>
            </SettingsRow>

            <SettingsRow :label="$t('checkAllImageUpdates')" :description="$t('checkAllHelp')">
                <button class="btn btn-normal" type="button" :disabled="checkingAll" @click="checkAllNow">
                    <font-awesome-icon icon="arrows-rotate" :spin="checkingAll" />
                    {{ $t("checkNow") }}
                </button>
            </SettingsRow>

            <SettingsRow :label="$t('perServiceLabels')" :description="$t('perServiceLabelsHelp')" stacked>
                <ul class="label-list">
                    <li><code>dockge.update.enable=false</code><span>{{ $t("labelEnableHelp") }}</span></li>
                    <li><code>dockge.update.watch_tags=true</code><span>{{ $t("labelWatchTagsHelp") }}</span></li>
                    <li><code>dockge.update.include_tags=^1\.\d+$</code><span>{{ $t("labelIncludeHelp") }}</span></li>
                    <li><code>dockge.update.exclude_tags=rc;beta</code><span>{{ $t("labelExcludeHelp") }}</span></li>
                </ul>
            </SettingsRow>
        </SettingsCard>
    </div>
</template>

<script>
import SettingsCard from "./SettingsCard.vue";
import SettingsRow from "./SettingsRow.vue";

import dayjs from "dayjs";
import { timezoneList } from "../../util-frontend";

export default {
    components: {
        SettingsCard,
        SettingsRow,
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

<style lang="scss" scoped>
.interval-group {
    width: 160px !important;
}

.label-list {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 8px 16px;
    font-size: 13px;

    li {
        display: contents;
    }

    span {
        color: var(--text-2);
        align-self: center;
    }
}

@media (max-width: 767px) {
    .label-list {
        grid-template-columns: minmax(0, 1fr);

        span {
            margin-bottom: 8px;
        }
    }
}
</style>
