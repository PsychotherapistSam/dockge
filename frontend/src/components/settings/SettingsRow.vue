<template>
    <div class="settings-row" :class="{ stacked }">
        <div class="settings-row-text">
            <label v-if="labelFor" :for="labelFor" class="settings-row-label">{{ label }}</label>
            <div v-else class="settings-row-label">{{ label }}</div>
            <div v-if="description || $slots.description" class="settings-row-description">
                <slot name="description">{{ description }}</slot>
            </div>
        </div>
        <div class="settings-row-control">
            <slot />
        </div>
    </div>
</template>

<script>
/**
 * One setting: label and explanation on the left, the control on the right.
 * `stacked` puts a wide control (an editor, a list) below the text instead.
 */
export default {
    props: {
        label: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: "",
        },
        /** id of the control, so clicking the label focuses it */
        labelFor: {
            type: String,
            default: "",
        },
        stacked: {
            type: Boolean,
            default: false,
        },
    },
};
</script>

<style lang="scss" scoped>
.settings-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px 32px;
    padding: 16px 24px;

    & + & {
        border-top: 1px solid var(--hairline);
    }

    &.stacked {
        grid-template-columns: minmax(0, 1fr);
        align-items: stretch;
    }
}

.settings-row-text {
    min-width: 0;
}

.settings-row-label {
    display: block;
    font-weight: 500;
    color: var(--text);
    margin: 0;
}

.settings-row-description {
    margin-top: 2px;
    font-size: 13px;
    line-height: 20px;
    color: var(--text-2);
    max-width: 560px;
}

.settings-row-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;

    .stacked & {
        justify-content: flex-start;
        display: block;
    }

    // Standard control widths, so controls line up down the card
    :deep(.form-control:not(textarea)),
    :deep(.form-select),
    :deep(.input-group) {
        width: 280px;
        max-width: 100%;
    }

    // Inside an input group the field shares the group's width
    :deep(.input-group) {
        flex-wrap: nowrap;

        .form-control {
            width: auto;
            flex: 1 1 auto;
            min-width: 0;
        }
    }

    :deep(.form-check.form-switch) {
        margin: 0;
        padding-left: 0;
        min-height: 0;

        .form-check-input {
            margin: 0;
            width: 36px;
            height: 20px;
            cursor: pointer;
        }
    }
}

@media (max-width: 767px) {
    .settings-row {
        grid-template-columns: minmax(0, 1fr);
        padding: 16px;
    }

    .settings-row-control {
        justify-content: flex-start;

        :deep(.form-control:not(textarea)),
        :deep(.form-select),
        :deep(.input-group) {
            width: 100%;
        }
    }
}
</style>
