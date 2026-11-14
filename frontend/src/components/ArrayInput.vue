<template>
    <div>
        <div v-if="valid" ref="list" class="list-editor">
            <template v-if="isArrayInited">
                <div v-for="(value, index) in array" :key="index" class="list-editor-row">
                    <input
                        v-model="array[index]"
                        type="text"
                        class="form-control"
                        :placeholder="placeholder"
                        :aria-label="displayName"
                        spellcheck="false"
                        @keydown.enter.prevent="onEnter(index)"
                    />
                    <button type="button" class="btn-icon list-editor-remove" :title="$t('Remove')" @click="remove(index)">
                        <font-awesome-icon icon="times" />
                    </button>
                </div>
            </template>

            <button type="button" class="list-editor-add" @click="addAndFocus">
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
        objectType: {
            type: String,
            default: "service",
        }
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

        /**
         * Not a good name, but it is used to get the object.
         */
        service() {
            if (this.objectType === "service") {
                // Used in Container.vue
                return this.$parent.$parent.service;
            } else if (this.objectType === "x-dockge") {

                if (!this.$parent.$parent.jsonConfig["x-dockge"]) {
                    return {};
                }

                // Used in Compose.vue
                return this.$parent.$parent.jsonConfig["x-dockge"];
            } else {
                return {};
            }
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

            // Create the object if not exists.
            if (this.objectType === "x-dockge") {
                if (!this.$parent.$parent.jsonConfig["x-dockge"]) {
                    this.$parent.$parent.jsonConfig["x-dockge"] = {};
                }
            }

            // Create the array if not exists.
            if (!this.service[this.name]) {
                this.service[this.name] = [];
            }

            this.array.push("");
        },
        remove(index) {
            this.array.splice(index, 1);
        },
        /** Add an entry and put the cursor in it */
        addAndFocus() {
            this.addField();
            this.$nextTick(() => {
                const inputs = this.$refs.list?.querySelectorAll("input");
                inputs?.[inputs.length - 1]?.focus();
            });
        },
        /** Enter in the last entry adds the next one, elsewhere it moves down */
        onEnter(index) {
            if (index === this.array.length - 1) {
                if (this.array[index] !== "") {
                    this.addAndFocus();
                }
            } else {
                this.$refs.list?.querySelectorAll("input")?.[index + 1]?.focus();
            }
        },
    }
};
</script>
