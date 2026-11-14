<template>
    <transition name="slide-fade" appear>
        <div v-if="!processing">
            <h1 class="page-title">{{ $t("console") }}</h1>

            <Terminal v-if="enableConsole" class="terminal" :rows="20" mode="mainTerminal" name="console" :endpoint="endpoint"></Terminal>

            <div v-else class="console-off">
                <font-awesome-icon icon="terminal" class="console-off-icon" />
                <h2 class="console-off-title">{{ $t("Console is not enabled") }}</h2>
                <i18n-t keypath="ConsoleNotEnabledMSG1" tag="p">
                    <template #docker><code>{{ $t('dockerCode') }}</code></template>
                    <template #rm><code>{{ $t('rmCode') }}</code></template>
                </i18n-t>

                <i18n-t keypath="ConsoleNotEnabledMSG2" tag="p">
                    <template #rmRf>
                        <code>{{ $t('rmRfCode') }}</code>
                    </template>
                </i18n-t>

                <i18n-t keypath="ConsoleNotEnabledMSG3" tag="p">
                    <template #envVar>
                        <code>{{ $t('envVarCode') }}</code>
                    </template>
                </i18n-t>
            </div>
        </div>
    </transition>
</template>

<script>
export default {
    components: {
    },
    data() {
        return {
            processing: true,
            enableConsole: false,
        };
    },
    computed: {
        endpoint() {
            return this.$route.params.endpoint || "";
        },
    },
    mounted() {
        this.$root.emitAgent(this.endpoint, "checkMainTerminal", (res) => {
            this.enableConsole = res.ok;
            this.processing = false;
        });
    },
    methods: {

    }
};
</script>

<style scoped lang="scss">
.terminal {
    height: 410px;
}

.console-off {
    max-width: 640px;
    padding: 24px;
    border: 1px solid var(--hairline);
    border-radius: 16px;
    background-color: var(--surface);
    color: var(--text-2);

    p {
        margin-bottom: 8px;

        &:last-child {
            margin-bottom: 0;
        }
    }

    code {
        padding: 0 4px;
        border-radius: 4px;
        color: var(--text);
        background-color: var(--raised);
    }
}

.console-off-icon {
    width: 16px;
    height: 16px;
    margin-bottom: 12px;
    color: var(--text-3);
}

.console-off-title {
    margin-bottom: 8px;
    font-size: 16px;
    line-height: 24px;
    color: var(--text);
}
</style>
