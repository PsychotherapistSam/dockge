<template>
    <router-link :to="url" :class="{ 'dim' : !stack.isManagedByDockge }" class="item">
        <Uptime :stack="stack" />
        <span class="title" :title="stackName">{{ stackName }}</span>
        <span
            v-if="stack.imageUpdateCount > 0"
            class="update-mark"
            :title="$t('stackHasImageUpdates', { n: stack.imageUpdateCount })"
        >
            <font-awesome-icon icon="cloud-arrow-down" />
            <span class="mono">{{ stack.imageUpdateCount }}</span>
        </span>
    </router-link>
</template>

<script>
import Uptime from "./Uptime.vue";

export default {
    components: {
        Uptime
    },
    props: {
        /** Stack this represents */
        stack: {
            type: Object,
            default: null,
        },
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        /** How many ancestors are above this stack */
        depth: {
            type: Number,
            default: 0,
        },
        /** Callback to determine if stack is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    computed: {
        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
        stackName() {
            return this.stack.name;
        }
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 32px;
    padding: 0 10px;
    border-radius: 10px;
    color: var(--text-2);
    text-decoration: none;
    transition: color 0.15s $ease, background-color 0.15s $ease;

    &:hover {
        color: var(--text);
        background-color: var(--raised);
    }

    &.active,
    &.router-link-active {
        color: var(--text);
        background-color: var(--accent-soft);
    }

    &:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
}

.title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.update-mark {
    margin-right: 2px;
}

.dim {
    opacity: 0.55;
}
</style>
