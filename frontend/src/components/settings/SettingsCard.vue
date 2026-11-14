<template>
    <section class="settings-card">
        <header v-if="title || $slots.header" class="settings-card-header">
            <slot name="header">
                <h2 class="settings-card-title">{{ title }}</h2>
                <p v-if="description || $slots.description" class="settings-card-description">
                    <slot name="description">{{ description }}</slot>
                </p>
            </slot>
        </header>
        <div class="settings-card-body">
            <slot />
        </div>
        <footer v-if="$slots.footer" class="settings-card-footer">
            <slot name="footer" />
        </footer>
    </section>
</template>

<script>
/**
 * A group of related settings: optional title and description, rows, optional footer with actions
 */
export default {
    props: {
        title: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: "",
        },
    },
};
</script>

<style lang="scss" scoped>
.settings-card {
    background-color: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
    overflow: hidden;
}

.settings-card-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--hairline);
}

.settings-card-title {
    font-size: 16px;
    line-height: 24px;
    font-weight: 500;
    margin: 0;
}

.settings-card-description {
    margin: 4px 0 0;
    font-size: 13px;
    line-height: 20px;
    color: var(--text-2);
    max-width: 640px;
}

.settings-card-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 24px;
    border-top: 1px solid var(--hairline);
    background-color: var(--bg);
}
</style>
