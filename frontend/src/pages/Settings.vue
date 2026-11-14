<template>
    <div class="settings">
        <h1 v-show="show" class="page-title">
            {{ $t("Settings") }}
        </h1>

        <div class="settings-layout">
            <nav v-if="showSubMenu" class="settings-menu">
                <router-link
                    v-for="(item, key) in subMenus"
                    :key="key"
                    :to="`/settings/${key}`"
                    class="menu-item"
                >
                    <font-awesome-icon :icon="item.icon" fixed-width />
                    {{ item.title }}
                </router-link>

                <!-- Logout Button -->
                <a v-if="$root.isMobile && $root.loggedIn && $root.socket.token !== 'autoLogin'" href="#" class="menu-item logout" @click.prevent="$root.logout">
                    <font-awesome-icon icon="sign-out-alt" fixed-width />
                    {{ $t("Logout") }}
                </a>
            </nav>
            <section v-if="currentPage" class="settings-content">
                <div class="settings-content-head">
                    <h2 class="settings-content-title">{{ subMenus[currentPage].title }}</h2>
                    <p class="settings-content-description">{{ subMenus[currentPage].description }}</p>
                </div>
                <router-view v-slot="{ Component }">
                    <transition name="slide-fade" appear>
                        <component :is="Component" />
                    </transition>
                </router-view>

                <transition name="slide-fade">
                    <div v-if="isDirty && savesWithBar" class="save-bar" role="status">
                        <span class="save-bar-text"><span class="save-bar-dot"></span>{{ $t("unsavedChanges") }}</span>
                        <button type="button" class="btn btn-normal btn-sm" @click="loadSettings">{{ $t("Discard") }}</button>
                        <button type="button" class="btn btn-primary btn-sm" @click="saveSettings()">{{ $t("Save") }}</button>
                    </div>
                </transition>
            </section>
        </div>
    </div>
</template>

<script>
import { useRoute } from "vue-router";

export default {
    data() {
        return {
            show: true,
            settings: {},
            savedSettings: "",
            settingsLoaded: false,
        };
    },

    computed: {
        currentPage() {
            let pathSplit = useRoute().path.split("/");
            let pathEnd = pathSplit[pathSplit.length - 1];
            if (!pathEnd || pathEnd === "settings") {
                return null;
            }
            return pathEnd;
        },

        showSubMenu() {
            if (this.$root.isMobile) {
                return !this.currentPage;
            } else {
                return true;
            }
        },

        subMenus() {
            return {
                general: {
                    title: this.$t("general"),
                    description: this.$t("settingsGeneralDescription"),
                    icon: "sliders",
                },
                appearance: {
                    title: this.$t("Appearance"),
                    description: this.$t("settingsAppearanceDescription"),
                    icon: "palette",
                },
                security: {
                    title: this.$t("Security"),
                    description: this.$t("settingsSecurityDescription"),
                    icon: "shield-halved",
                },
                globalEnv: {
                    title: this.$t("GlobalEnv"),
                    description: this.$t("settingsGlobalEnvDescription"),
                    icon: "file-code",
                },
                about: {
                    title: this.$t("About"),
                    description: this.$t("settingsAboutDescription"),
                    icon: "circle-info",
                },
            };
        },

        /** Settings changed since they were loaded or saved */
        isDirty() {
            return this.settingsLoaded && JSON.stringify(this.settings) !== this.savedSettings;
        },

        /** Pages whose changes are saved through the save bar */
        savesWithBar() {
            return this.currentPage === "general" || this.currentPage === "globalEnv";
        },
    },

    watch: {
        "$root.isMobile"() {
            this.loadGeneralPage();
        }
    },

    mounted() {
        this.loadSettings();
        this.loadGeneralPage();
    },

    methods: {

        /**
         * Load the general settings page
         * For desktop only, on mobile do nothing
         */
        loadGeneralPage() {
            if (!this.currentPage && !this.$root.isMobile) {
                this.$router.push("/settings/general");
            }
        },

        /** Load settings from server */
        loadSettings() {
            this.$root.getSocket().emit("getSettings", (res) => {
                this.settings = res.data;
                if (this.settings.checkUpdate === undefined) {
                    this.settings.checkUpdate = true;
                }
                this.savedSettings = JSON.stringify(this.settings);
                this.settingsLoaded = true;
            });
        },

        /**
         * Callback for saving settings
         * @callback saveSettingsCB
         * @param {Object} res Result of operation
         */

        /**
         * Save Settings
         * @param {saveSettingsCB} [callback]
         * @param {string} [currentPassword] Only need for disableAuth to true
         */
        saveSettings(callback, currentPassword) {
            let valid = this.validateSettings();
            if (valid.success) {
                this.$root.getSocket().emit("setSettings", this.settings, currentPassword, (res) => {
                    this.$root.toastRes(res);
                    this.loadSettings();

                    if (callback) {
                        callback();
                    }
                });
            } else {
                this.$root.toastError(valid.msg);
            }
        },

        /**
         * Ensure settings are valid
         * @returns {Object} Contains success state and error msg
         */
        validateSettings() {
            if (this.settings.keepDataPeriodDays < 0) {
                return {
                    success: false,
                    msg: this.$t("dataRetentionTimeError"),
                };
            }
            return {
                success: true,
                msg: "",
            };
        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.settings-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 40px;
    align-items: start;
    max-width: 1100px;
}

.settings-menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: sticky;
    top: 80px;
}

.menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--text-2);
    text-decoration: none;
    transition: color 0.15s $ease, background-color 0.15s $ease;

    svg {
        width: 15px;
        color: var(--text-3);
        transition: color 0.15s $ease;
    }

    &:hover {
        color: var(--text);
        background-color: var(--raised);
    }

    &.active,
    &.router-link-active {
        color: var(--text);
        background-color: var(--accent-soft);

        svg {
            color: var(--accent-ink);
        }
    }
}

.settings-content {
    min-width: 0;
    position: relative;
    padding-bottom: 72px;
}

.settings-content-head {
    margin-bottom: 20px;
}

.settings-content-title {
    font-size: 20px;
    line-height: 28px;
    margin: 0;
}

.settings-content-description {
    margin: 4px 0 0;
    color: var(--text-2);
}

:deep(.settings-stack) {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.save-bar {
    position: sticky;
    bottom: 16px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 24px;
    padding: 10px 10px 10px 16px;
    background-color: var(--surface);
    border: 1px solid var(--hairline-strong);
    border-radius: 14px;
    box-shadow: var(--shadow-float);
}

.save-bar-text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
    color: var(--text-2);
}

.save-bar-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--accent-ink);
}

.logout {
    color: var(--err) !important;
}

@media (max-width: 767px) {
    .settings-layout {
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
    }

    .settings-menu {
        position: static;
        flex-direction: row;
        overflow-x: auto;
        margin: 0 -16px;
        padding: 0 16px 4px;
    }

    .menu-item {
        flex-shrink: 0;
    }
}
</style>
