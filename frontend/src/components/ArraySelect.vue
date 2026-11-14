<template>
    <div>
        <div v-if="valid" class="list-editor">
            <template v-if="isArrayInited">
                <div v-for="(value, index) in array" :key="index" class="list-editor-row">
                    <select v-model="array[index]" class="form-select" :aria-label="displayName">
                        <option value="">{{ $t(`Select a network...`) }}</option>
                        <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
                    </select>
                    <button type="button" class="btn-icon list-editor-remove" :title="$t('Remove')" @click="remove(index)">
                        <font-awesome-icon icon="times" />
                    </button>
                </div>
            </template>

            <button type="button" class="list-editor-add" @click="addField">
                <font-awesome-icon icon="plus" />
                {{ $t("addListItem", [ addLabel ]) }}
            </button>
        </div>
        <div v-else class="list-editor-note">
            {{ $t("LongSyntaxNotSupported") }}
        </div>
    </div>
</template>

<script>
export default {
    props: {
        name: {
            type: String,
            required: true,
        },
        placeholder: {
            type: String,
            default: "",
        },
        displayName: {
            type: String,
            required: true,
        },
        options: {
            type: Array,
            required: true,
        },
    },
    data() {
        return {

        };
    },
    computed: {
        /** "Port" -> "port" for "Add port", but keep acronyms like "URL" */
        addLabel() {
            const name = this.displayName || "";
            if (name.length > 1 && name === name.toUpperCase()) {
                return name;
            }
            return name.charAt(0).toLowerCase() + name.slice(1);
        },

        array() {
            // Create the array if not exists, it should be safe.
            if (!this.service[this.name]) {
                return [];
            }
            return this.service[this.name];
        },

        /**
         * Check if the array is inited before called v-for.
         * Prevent empty arrays inserted to the YAML file.
         * @return {boolean}
         */
        isArrayInited() {
            return this.service[this.name] !== undefined;
        },

        service() {
            return this.$parent.$parent.service;
        },

        valid() {
            // Check if the array is actually an array
            if (!Array.isArray(this.array)) {
                return false;
            }

            // Check if the array contains non-object only.
            for (let item of this.array) {
                if (typeof item === "object") {
                    return false;
                }
            }
            return true;
        }

    },
    created() {

    },
    methods: {
        addField() {
            // Create the array if not exists.
            if (!this.service[this.name]) {
                this.service[this.name] = [];
            }
            this.array.push("");
        },
        remove(index) {
            this.array.splice(index, 1);
        },
    }
};
</script>
