<template>
    <div :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <header class="app-header">
            <router-link to="/" class="brand">
                <img class="brand-mark" src="/icon.svg" alt="" width="24" height="24" />
                <span class="brand-name">Dockge</span>
            </router-link>

            <div class="header-actions">
                <a v-if="hasNewVersion" target="_blank" rel="noopener" :href="releasesURL" class="btn btn-sm btn-normal update-btn">
                    <font-awesome-icon icon="arrow-alt-circle-up" class="update-icon" />{{ $t("newUpdate") }}
                </a>

                <nav v-if="$root.loggedIn" class="nav nav-pills">
                    <router-link to="/" class="nav-link" exact-active-class="active">
                        <font-awesome-icon icon="home" />
                        <span class="nav-label">{{ $t("home") }}</span>
                    </router-link>
                    <router-link to="/console" class="nav-link">
                        <font-awesome-icon icon="terminal" />
                        <span class="nav-label">{{ $t("console") }}</span>
                    </router-link>
                </nav>

                <div v-if="$root.loggedIn" class="dropdown dropdown-profile-pic">
                    <button type="button" class="profile-button" data-bs-toggle="dropdown" aria-expanded="false" :aria-label="$t('Settings')">
                        <span class="profile-pic">{{ $root.usernameFirstChar }}</span>
                        <font-awesome-icon icon="angle-down" class="profile-chevron" />
                    </button>

                    <ul class="dropdown-menu dropdown-menu-end">
                        <li>
                            <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                                <strong>{{ $root.username }}</strong>
                            </i18n-t>
                            <span v-if="$root.username == null" class="dropdown-item-text">{{ $t("signedInDispDisabled") }}</span>
                        </li>

                        <li><hr class="dropdown-divider"></li>

                        <li>
                            <button class="dropdown-item" @click="scanFolder">
                                <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                            </button>
                        </li>

                        <li>
                            <router-link to="/settings/general" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                            </router-link>
                        </li>

                        <li>
                            <button class="dropdown-item" @click="$root.logout">
                                <font-awesome-icon icon="sign-out-alt" />
                                {{ $t("Logout") }}
                            </button>
                        </li>
                    </ul>
                </div>
            </div>
        </header>

        <main>
            <div v-if="$root.socketIO.connecting" class="connecting">
                {{ $t("connecting...") }}
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS, GITHUB_RELEASES_URL } from "../../../common/util-common";

export default {

    components: {
        Login,
    },

    data() {
        return {

        };
    },

    computed: {

        releasesURL() {
            return GITHUB_RELEASES_URL;
        },

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.app-header {
    position: sticky;
    top: 0;
    z-index: 1020;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 16px 0 20px;
    background-color: var(--bg-deep);
    border-bottom: 1px solid var(--hairline);
}

.brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
}

.brand-mark {
    display: block;
}

.brand-name {
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.update-btn .update-icon {
    color: var(--accent-ink);
}

.nav {
    gap: 4px;

    .nav-link {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 32px;
        padding: 0 12px;
        font-size: 14px;

        svg {
            width: 14px;
            color: var(--text-3);
        }

        &.active svg {
            color: var(--text-2);
        }
    }
}

.profile-button {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 8px 0 4px;
    color: var(--text-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    transition: background-color 0.15s $ease, border-color 0.15s $ease;

    &:hover,
    &[aria-expanded="true"] {
        background-color: var(--raised);
        border-color: var(--hairline);
    }

    &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }
}

.profile-pic {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    background-color: var(--raised);
    box-shadow: inset 0 0 0 1px var(--hairline);
}

.profile-chevron {
    width: 10px;
}

.dropdown-menu {
    min-width: 220px;
    margin-top: 8px !important;
}

main {
    min-height: calc(100vh - 56px);
}

.connecting {
    padding: 32px;
    color: var(--text-2);
}

.lost-connection {
    position: fixed;
    z-index: 99999;
    width: 100%;
    padding: 8px 16px;
    color: #fff;
    background-color: var(--err);

    a {
        color: inherit;
        text-decoration: underline;
    }
}

@media (max-width: 767px) {
    .app-header {
        padding: 0 12px;
    }

    .nav-label,
    .update-btn {
        display: none !important;
    }
}
</style>
