"use strict";
/* eslint-disable @typescript-eslint/prefer-for-of */
Object.defineProperty(exports, "__esModule", { value: true });
/** Checks whether the given object is an object and not null/undefined. */
function isEmptyObject(obj) {
    return typeof obj === 'object' && Object.keys(obj || {}).length === 0;
}
// Mostly copied from https://medium.com/@lubaka.a/how-to-remove-lodash-performance-improvement-b306669ad0e1
/**
 * Checks whether the given value can be merged. It has to be an object, but not an array, RegExp or Date.
 */
function isMergeableObject(value) {
    const isNonNullObject = value != null ? typeof value === 'object' : false;
    return isNonNullObject && Object.prototype.toString.call(value) !== '[object RegExp]' && Object.prototype.toString.call(value) !== '[object Date]' && !Array.isArray(value);
}
/**
 * Merges the source object into the target object.
 * @param target - The target object.
 * @param source - The source object.
 * @param shouldRemoveNullObjectValues - If true, null object values will be removed.
 * @returns - The merged object.
 */
function mergeObject(target, source, shouldRemoveNullObjectValues = true) {
    const destination = {};
    // First we want to copy over all keys from the target into the destination object,
    // in case "target" is a mergable object.
    // If "shouldRemoveNullObjectValues" is true, we want to remove null values from the merged object
    // and therefore we need to omit keys where either the source or target value is null.
    if (isMergeableObject(target)) {
        const targetKeys = Object.keys(target);
        for (let i = 0; i < targetKeys.length; ++i) {
            const key = targetKeys[i];
            const sourceValue = source === null || source === void 0 ? void 0 : source[key];
            const targetValue = target === null || target === void 0 ? void 0 : target[key];
            // If "shouldRemoveNullObjectValues" is true, we want to remove null values from the merged object.
            // Therefore, if either target or source value is null, we want to prevent the key from being set.
            const isSourceOrTargetNull = targetValue === null || sourceValue === null;
            const shouldOmitTargetKey = shouldRemoveNullObjectValues && isSourceOrTargetNull;
            if (!shouldOmitTargetKey) {
                destination[key] = targetValue;
            }
        }
    }
    // After copying over all keys from the target object, we want to merge the source object into the destination object.
    const sourceKeys = Object.keys(source);
    for (let i = 0; i < sourceKeys.length; ++i) {
        const key = sourceKeys[i];
        const sourceValue = source === null || source === void 0 ? void 0 : source[key];
        const targetValue = target === null || target === void 0 ? void 0 : target[key];
        // If undefined is passed as the source value for a key, we want to generally ignore it.
        // If "shouldRemoveNullObjectValues" is set to true and the source value is null,
        // we don't want to set/merge the source value into the merged object.
        const shouldIgnoreNullSourceValue = shouldRemoveNullObjectValues && sourceValue === null;
        const shouldOmitSourceKey = sourceValue === undefined || shouldIgnoreNullSourceValue;
        if (!shouldOmitSourceKey) {
            // If the source value is a mergable object, we want to merge it into the target value.
            // If "shouldRemoveNullObjectValues" is true, "fastMerge" will recursively
            // remove nested null values from the merged object.
            // If source value is any other value we need to set the source value it directly.
            if (isMergeableObject(sourceValue)) {
                // If the target value is null or undefined, we need to fallback to an empty object,
                // so that we can still use "fastMerge" to merge the source value,
                // to ensure that nested null values are removed from the merged object.
                const targetValueWithFallback = (targetValue !== null && targetValue !== void 0 ? targetValue : {});
                destination[key] = fastMerge(targetValueWithFallback, sourceValue, shouldRemoveNullObjectValues);
            }
            else {
                destination[key] = sourceValue;
            }
        }
    }
    return destination;
}
/**
 * Merges two objects and removes null values if "shouldRemoveNullObjectValues" is set to true
 *
 * We generally want to remove null values from objects written to disk and cache, because it decreases the amount of data stored in memory and on disk.
 * On native, when merging an existing value with new changes, SQLite will use JSON_PATCH, which removes top-level nullish values.
 * To be consistent with the behaviour for merge, we'll also want to remove null values for "set" operations.
 */
function fastMerge(target, source, shouldRemoveNullObjectValues = true) {
    // We have to ignore arrays and nullish values here,
    // otherwise "mergeObject" will throw an error,
    // because it expects an object as "source"
    if (Array.isArray(source) || source === null || source === undefined) {
        return source;
    }
    return mergeObject(target, source, shouldRemoveNullObjectValues);
}
/** Deep removes the nested null values from the given value. */
function removeNestedNullValues(value) {
    if (typeof value === 'object' && !Array.isArray(value)) {
        return fastMerge(value, value);
    }
    return value;
}
/** Formats the action name by uppercasing and adding the key if provided. */
function formatActionName(method, key) {
    return key ? `${method.toUpperCase()}/${key}` : method.toUpperCase();
}
exports.default = { isEmptyObject, fastMerge, formatActionName, removeNestedNullValues };
