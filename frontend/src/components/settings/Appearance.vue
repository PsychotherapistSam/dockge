<template>
    <div class="settings-stack">
        <SettingsCard>
            <SettingsRow :label="$t('Language')" :description="$t('languageHelp')" label-for="language">
                <select id="language" v-model="$root.language" class="form-select">
                    <option
                        v-for="(lang, i) in $i18n.availableLocales"
                        :key="`Lang${i}`"
                        :value="lang"
                    >
                        {{ $i18n.messages[lang].languageName }}
                    </option>
                </select>
            </SettingsRow>

            <SettingsRow :label="$t('Theme')" :description="$t('themeHelp')">
                <div class="btn-group" role="group" :aria-label="$t('Theme')">
                    <input id="btncheck1" v-model="$root.userTheme" type="radio" class="btn-check" name="theme" autocomplete="off" value="light" />
                    <label class="btn btn-outline-primary" for="btncheck1">
                        <font-awesome-icon icon="sun" /> {{ $t("Light") }}
                    </label>

                    <input id="btncheck2" v-model="$root.userTheme" type="radio" class="btn-check" name="theme" autocomplete="off" value="dark" />
                    <label class="btn btn-outline-primary" for="btncheck2">
                        <font-awesome-icon icon="moon" /> {{ $t("Dark") }}
                    </label>

                    <input id="btncheck3" v-model="$root.userTheme" type="radio" class="btn-check" name="theme" autocomplete="off" value="auto" />
                    <label class="btn btn-outline-primary" for="btncheck3">
                        <font-awesome-icon icon="circle-half-stroke" /> {{ $t("Auto") }}
                    </label>
                </div>
            </SettingsRow>
        </SettingsCard>
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

};
</script>

<style lang="scss" scoped>
</style>
