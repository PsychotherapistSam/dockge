<template>
    <div class="settings-stack">
        <SettingsCard>
            <template #header>
                <div class="about-brand">
                    <img src="/icon.svg" alt="" width="56" height="56" />
                    <div>
                        <div class="about-name">Dockge</div>
                        <dl class="about-versions">
                            <dt>{{ $t("Version") }}</dt>
                            <dd class="mono">{{ $root.info.version }}</dd>
                            <dt>{{ $t("Frontend Version") }}</dt>
                            <dd class="mono">{{ $root.frontendVersion }}</dd>
                        </dl>
                    </div>
                </div>
                <div v-if="!$root.isFrontendBackendVersionMatched" class="version-warning">
                    <font-awesome-icon icon="exclamation-circle" />
                    {{ $t("Frontend Version do not match backend version!") }}
                </div>
            </template>

            <SettingsRow :label="$t('Show update if available')" :description="$t('updateNoticeHelp')" label-for="checkUpdate">
                <div class="form-check form-switch">
                    <input id="checkUpdate" v-model="settings.checkUpdate" class="form-check-input" type="checkbox" role="switch" @change="saveSettings()" />
                </div>
            </SettingsRow>

            <SettingsRow :label="$t('Also check beta release')" :description="$t('betaHelp')" label-for="checkBeta">
                <div class="form-check form-switch">
                    <input id="checkBeta" v-model="settings.checkBeta" class="form-check-input" type="checkbox" role="switch" :disabled="!settings.checkUpdate" @change="saveSettings()" />
                </div>
            </SettingsRow>

            <SettingsRow :label="$t('Check Update On GitHub')" :description="$t('releasesHelp')">
                <a :href="releasesURL" target="_blank" rel="noopener" class="btn btn-normal">
                    <font-awesome-icon icon="external-link-square-alt" />
                    {{ $t("openOnGitHub") }}
                </a>
            </SettingsRow>
        </SettingsCard>
    </div>
</template>

<script>
import SettingsCard from "./SettingsCard.vue";
import SettingsRow from "./SettingsRow.vue";
import { GITHUB_RELEASES_URL } from "../../../../common/util-common";

export default {
    components: {
        SettingsCard,
        SettingsRow,
    },
    computed: {
        releasesURL() {
            return GITHUB_RELEASES_URL;
        },
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
    },

    watch: {

    }
};
</script>

<style lang="scss" scoped>
.about-brand {
    display: flex;
    align-items: center;
    gap: 16px;

    img {
        display: block;
    }
}

.about-name {
    font-size: 18px;
    line-height: 24px;
    font-weight: 600;
    margin-bottom: 4px;
}

.about-versions {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    gap: 0 12px;
    margin: 0;
    font-size: 13px;

    dt {
        font-weight: 400;
        color: var(--text-3);
    }

    dd {
        margin: 0;
        color: var(--text-2);
    }
}

.version-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    font-size: 13px;
    color: var(--text-2);

    svg {
        width: 14px;
        color: var(--warn);
    }
}
</style>
