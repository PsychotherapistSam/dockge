<template>
    <div class="settings-stack">
        <SettingsCard v-if="settingsLoaded">
            <SettingsRow label="global.env" :description="$t('globalEnvHelp')" stacked>
                <div class="editor-box">
                    <code-mirror
                        ref="editor"
                        v-model="settings.globalENV"
                        :extensions="extensionsEnv"
                        minimal
                        wrap="true"
                        dark="true"
                        tab="true"
                        :hasFocus="editorFocus"
                        @change="onChange"
                    />
                </div>
            </SettingsRow>
        </SettingsCard>
    </div>
</template>

<script>
import SettingsCard from "./SettingsCard.vue";
import SettingsRow from "./SettingsRow.vue";
import CodeMirror from "vue-codemirror6";
import { python } from "@codemirror/lang-python"; // good enough for .env key=value highlighting
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView } from "@codemirror/view";
import { ref } from "vue";

export default {
    name: "GlobalEnv",
    components: {
        CodeMirror,
        SettingsCard,
        SettingsRow,
    },

    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensionsEnv = [
            editorTheme,
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler),
        ];

        return { editorFocus,
            extensionsEnv };
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
    },

    methods: {
        /** Save the settings */
        saveGeneral() {
            this.saveSettings();
        },

        onChange() {
            // hook for future live validation if desired
        },
    },
};
</script>

<style scoped lang="scss">
@import "../../styles/vars.scss";

.editor-box {
    font-family: $font-family-monospace;
    font-size: 13px;
    line-height: 20px;
    padding: 12px 4px;
    background-color: var(--editor-bg) !important;
    border: 1px solid var(--hairline-strong);
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    overflow: hidden;
}
</style>
