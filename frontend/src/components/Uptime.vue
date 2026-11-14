<template>
    <span class="stack-status" :title="statusName">
        <span class="led" :class="ledClass"></span>
        <span v-if="label" class="stack-status-label">{{ statusName }}</span>
    </span>
</template>

<script>
import { statusColor, statusNameShort } from "../../../common/util-common";

export default {
    props: {
        stack: {
            type: Object,
            default: null,
        },
        /** Show the status name next to the LED */
        label: {
            type: Boolean,
            default: false,
        },
    },

    computed: {
        statusName() {
            return this.$t(statusNameShort(this.stack?.status));
        },

        ledClass() {
            switch (statusColor(this.stack?.status)) {
                case "primary":
                    return "ok";
                case "danger":
                    return "err";
                default:
                    return "off";
            }
        },
    },
};
</script>

<style scoped>
.stack-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.stack-status-label {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-2);
}
</style>
