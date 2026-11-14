<template>
    <div class="app-shell">
        <aside class="sidebar" :class="{ 'on-home': $route.path === '/' }">
            <router-link to="/compose" class="btn btn-primary compose-btn">
                <font-awesome-icon icon="plus" /> {{ $t("compose") }}
            </router-link>
            <StackList :scrollbar="true" />
        </aside>

        <div ref="container" class="content">
            <!-- Add :key to disable vue router re-use the same component -->
            <router-view :key="$route.fullPath" :calculatedHeight="height" />
        </div>
    </div>
</template>

<script>

import StackList from "../components/StackList.vue";

export default {
    components: {
        StackList,
    },
    data() {
        return {
            height: 0
        };
    },
    mounted() {
        this.height = this.$refs.container.offsetHeight;
    },
};
</script>

<style lang="scss" scoped>
.app-shell {
    display: grid;
    grid-template-columns: 264px minmax(0, 1fr);
    min-height: calc(100vh - 56px);
}

.sidebar {
    position: sticky;
    top: 56px;
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: calc(100vh - 56px);
    padding: 16px 12px;
    background-color: var(--bg-deep);
    border-right: 1px solid var(--hairline);
}

.compose-btn {
    height: 36px;
    width: 100%;
}

.content {
    min-width: 0;
    width: 100%;
    max-width: 1920px;
    margin: 0 auto;
    padding: 24px 32px 48px;
}

@media (max-width: 767px) {
    .app-shell {
        grid-template-columns: minmax(0, 1fr);
    }

    // On phones the stack list only shows on Home, above the content
    .sidebar {
        position: static;
        height: auto;
        max-height: 50vh;
        border-right: 0;
        border-bottom: 1px solid var(--hairline);

        &:not(.on-home) {
            display: none;
        }
    }

    .content {
        padding: 16px 16px 48px;
    }
}
</style>
