"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-continue */
const underscore_1 = __importDefault(require("underscore"));
const Logger = __importStar(require("./Logger"));
const OnyxCache_1 = __importDefault(require("./OnyxCache"));
const createDeferredTask_1 = __importDefault(require("./createDeferredTask"));
const PerformanceUtils = __importStar(require("./PerformanceUtils"));
const storage_1 = __importDefault(require("./storage"));
const utils_1 = __importDefault(require("./utils"));
const DevTools_1 = __importDefault(require("./DevTools"));
const OnyxUtils_1 = __importDefault(require("./OnyxUtils"));
// Keeps track of the last connectionID that was used so we can keep incrementing it
let lastConnectionID = 0;
// Connections can be made before `Onyx.init`. They would wait for this task before resolving
const deferredInitTask = (0, createDeferredTask_1.default)();
/** Initialize the store with actions and listening for storage events */
function init({ keys = {}, initialKeyStates = {}, safeEvictionKeys = [], maxCachedKeysCount = 1000, shouldSyncMultipleInstances = Boolean(global.localStorage), debugSetState = false, }) {
    var _a;
    storage_1.default.init();
    if (shouldSyncMultipleInstances) {
        (_a = storage_1.default.keepInstancesSync) === null || _a === void 0 ? void 0 : _a.call(storage_1.default, (key, value) => {
            const prevValue = OnyxCache_1.default.getValue(key, false);
            OnyxCache_1.default.set(key, value);
            OnyxUtils_1.default.keyChanged(key, value, prevValue);
        });
    }
    if (debugSetState) {
        PerformanceUtils.setShouldDebugSetState(true);
    }
    if (maxCachedKeysCount > 0) {
        OnyxCache_1.default.setRecentKeysLimit(maxCachedKeysCount);
    }
    OnyxUtils_1.default.initStoreValues(keys, initialKeyStates, safeEvictionKeys);
    // Initialize all of our keys with data provided then give green light to any pending connections
    Promise.all([OnyxUtils_1.default.addAllSafeEvictionKeysToRecentlyAccessedList(), OnyxUtils_1.default.initializeWithDefaultKeyStates()]).then(deferredInitTask.resolve);
}
function computeAndSendData(mapping, dependencies) {
    let val = OnyxCache_1.default.getValue(mapping.key.cacheKey);
    if (val === undefined) {
        val = mapping.key.compute(dependencies);
        OnyxCache_1.default.set(mapping.key.cacheKey, val);
    }
    OnyxUtils_1.default.sendDataToConnection(mapping, val, mapping.key.cacheKey, true);
}
/**
 * Subscribes a react component's state directly to a store key
 *
 * @example
 * const connectionID = Onyx.connect({
 *     key: ONYXKEYS.SESSION,
 *     callback: onSessionChange,
 * });
 *
 * @param mapping the mapping information to connect Onyx to the components state
 * @param mapping.key ONYXKEY to subscribe to
 * @param [mapping.statePropertyName] the name of the property in the state to connect the data to
 * @param [mapping.withOnyxInstance] whose setState() method will be called with any changed data
 *      This is used by React components to connect to Onyx
 * @param [mapping.callback] a method that will be called with changed data
 *      This is used by any non-React code to connect to Onyx
 * @param [mapping.initWithStoredValues] If set to false, then no data will be prefilled into the
 *  component
 * @param [mapping.waitForCollectionCallback] If set to true, it will return the entire collection to the callback as a single object
 * @param [mapping.selector] THIS PARAM IS ONLY USED WITH withOnyx(). If included, this will be used to subscribe to a subset of an Onyx key's data.
 *       The sourceData and withOnyx state are passed to the selector and should return the simplified data. Using this setting on `withOnyx` can have very positive
 *       performance benefits because the component will only re-render when the subset of data changes. Otherwise, any change of data on any property would normally
 *       cause the component to re-render (and that can be expensive from a performance standpoint).
 * @param [mapping.initialValue] THIS PARAM IS ONLY USED WITH withOnyx().
 * If included, this will be passed to the component so that something can be rendered while data is being fetched from the DB.
 * Note that it will not cause the component to have the loading prop set to true.
 * @returns an ID to use when calling disconnect
 */
function connect(mapping) {
    const connectionID = lastConnectionID++;
    const callbackToStateMapping = OnyxUtils_1.default.getCallbackToStateMapping();
    callbackToStateMapping[connectionID] = mapping;
    callbackToStateMapping[connectionID].connectionID = connectionID;
    const mappingKey = mapping.key;
    if (OnyxUtils_1.default.isComputedKey(mappingKey)) {
        deferredInitTask.promise
            .then(() => OnyxUtils_1.default.addKeyToRecentlyAccessedIfNeeded(mapping))
            .then(() => {
            const mappingDependencies = mappingKey.dependencies || {};
            const dependenciesCount = underscore_1.default.size(mappingDependencies);
            if (dependenciesCount === 0) {
                // If we have no dependencies we can send the computed value immediately.
                computeAndSendData(mapping, {});
            }
            else {
                callbackToStateMapping[connectionID].dependencyConnections = [];
                const dependencyValues = {};
                underscore_1.default.each(mappingDependencies, (dependency, dependencyKey) => {
                    // Create a mapping of dependent cache keys so when a key changes, all dependent keys
                    // can also be cleared from the cache.
                    const cacheKey = OnyxUtils_1.default.getCacheKey(dependency);
                    OnyxUtils_1.default.addDependentCacheKey(cacheKey, mappingKey.cacheKey);
                    // Connect to dependencies.
                    const dependencyConnection = connect({
                        key: dependency,
                        waitForCollectionCallback: true,
                        callback: (value) => {
                            dependencyValues[dependencyKey] = value;
                            // Once all dependencies are ready, compute the value and send it to the connection.
                            if (underscore_1.default.size(dependencyValues) === dependenciesCount) {
                                computeAndSendData(mapping, dependencyValues);
                            }
                        },
                    });
                    // Store dependency connections so we can disconnect them later.
                    callbackToStateMapping[connectionID].dependencyConnections.push(dependencyConnection);
                });
            }
        });
        return connectionID;
    }
    if (mapping.initWithStoredValues === false) {
        return connectionID;
    }
    // Commit connection only after init passes
    deferredInitTask.promise
        .then(() => OnyxUtils_1.default.addKeyToRecentlyAccessedIfNeeded(mapping))
        .then(() => {
        // Performance improvement
        // If the mapping is connected to an onyx key that is not a collection
        // we can skip the call to getAllKeys() and return an array with a single item
        if (Boolean(mappingKey) && typeof mappingKey === 'string' && !mappingKey.endsWith('_') && OnyxCache_1.default.storageKeys.has(mappingKey)) {
            return new Set([mappingKey]);
        }
        return OnyxUtils_1.default.getAllKeys();
    })
        .then((keys) => {
        // We search all the keys in storage to see if any are a "match" for the subscriber we are connecting so that we
        // can send data back to the subscriber. Note that multiple keys can match as a subscriber could either be
        // subscribed to a "collection key" or a single key.
        const matchingKeys = Array.from(keys).filter((key) => OnyxUtils_1.default.isKeyMatch(mappingKey, key));
        // If the key being connected to does not exist we initialize the value with null. For subscribers that connected
        // directly via connect() they will simply get a null value sent to them without any information about which key matched
        // since there are none matched. In withOnyx() we wait for all connected keys to return a value before rendering the child
        // component. This null value will be filtered out so that the connected component can utilize defaultProps.
        if (matchingKeys.length === 0) {
            if (mappingKey && !OnyxUtils_1.default.isCollectionKey(mappingKey)) {
                OnyxCache_1.default.set(mappingKey, null);
            }
            // Here we cannot use batching because the null value is expected to be set immediately for default props
            // or they will be undefined.
            OnyxUtils_1.default.sendDataToConnection(mapping, null, undefined, false);
            return;
        }
        // When using a callback subscriber we will either trigger the provided callback for each key we find or combine all values
        // into an object and just make a single call. The latter behavior is enabled by providing a waitForCollectionCallback key
        // combined with a subscription to a collection key.
        if (typeof mapping.callback === 'function') {
            if (OnyxUtils_1.default.isCollectionKey(mappingKey)) {
                if (mapping.waitForCollectionCallback) {
                    OnyxUtils_1.default.getCollectionDataAndSendAsObject(matchingKeys, mapping);
                    return;
                }
                // We did not opt into using waitForCollectionCallback mode so the callback is called for every matching key.
                // eslint-disable-next-line @typescript-eslint/prefer-for-of
                for (let i = 0; i < matchingKeys.length; i++) {
                    OnyxUtils_1.default.get(matchingKeys[i]).then((val) => OnyxUtils_1.default.sendDataToConnection(mapping, val, matchingKeys[i], true));
                }
                return;
            }
            // If we are not subscribed to a collection key then there's only a single key to send an update for.
            OnyxUtils_1.default.get(mappingKey).then((val) => OnyxUtils_1.default.sendDataToConnection(mapping, val, mappingKey, true));
            return;
        }
        // If we have a withOnyxInstance that means a React component has subscribed via the withOnyx() HOC and we need to
        // group collection key member data into an object.
        if (mapping.withOnyxInstance) {
            if (OnyxUtils_1.default.isCollectionKey(mappingKey)) {
                OnyxUtils_1.default.getCollectionDataAndSendAsObject(matchingKeys, mapping);
                return;
            }
            // If the subscriber is not using a collection key then we just send a single value back to the subscriber
            OnyxUtils_1.default.get(mappingKey).then((val) => OnyxUtils_1.default.sendDataToConnection(mapping, val, mappingKey, true));
            return;
        }
        console.error('Warning: Onyx.connect() was found without a callback or withOnyxInstance');
    });
    // The connectionID is returned back to the caller so that it can be used to clean up the connection when it's no longer needed
    // by calling Onyx.disconnect(connectionID).
    return connectionID;
}
/**
 * Remove the listener for a react component
 * @example
 * Onyx.disconnect(connectionID);
 *
 * @param connectionID unique id returned by call to Onyx.connect()
 */
function disconnect(connectionID, keyToRemoveFromEvictionBlocklist) {
    const callbackToStateMapping = OnyxUtils_1.default.getCallbackToStateMapping();
    if (!callbackToStateMapping[connectionID]) {
        return;
    }
    // Remove this key from the eviction block list as we are no longer
    // subscribing to it and it should be safe to delete again
    if (keyToRemoveFromEvictionBlocklist) {
        OnyxUtils_1.default.removeFromEvictionBlockList(keyToRemoveFromEvictionBlocklist, connectionID);
    }
    if (callbackToStateMapping[connectionID].dependencyConnections) {
        callbackToStateMapping[connectionID].dependencyConnections.forEach((id) => disconnect(id));
    }
    delete callbackToStateMapping[connectionID];
}
/**
 * Write a value to our store with the given key
 *
 * @param key ONYXKEY to set
 * @param value value to store
 */
function set(key, value) {
    // If the value is null, we remove the key from storage
    const { value: valueAfterRemoving, wasRemoved } = OnyxUtils_1.default.removeNullValues(key, value);
    if (OnyxUtils_1.default.hasPendingMergeForKey(key)) {
        delete OnyxUtils_1.default.getMergeQueue()[key];
    }
    const hasChanged = OnyxCache_1.default.hasValueChanged(key, valueAfterRemoving);
    // Logging properties only since values could be sensitive things we don't want to log
    Logger.logInfo(`set called for key: ${key}${underscore_1.default.isObject(value) ? ` properties: ${underscore_1.default.keys(value).join(',')}` : ''} hasChanged: ${hasChanged}`);
    // This approach prioritizes fast UI changes without waiting for data to be stored in device storage.
    const updatePromise = OnyxUtils_1.default.broadcastUpdate(key, valueAfterRemoving, hasChanged, wasRemoved);
    // If the value has not changed or the key got removed, calling Storage.setItem() would be redundant and a waste of performance, so return early instead.
    if (!hasChanged || wasRemoved) {
        return updatePromise;
    }
    return storage_1.default.setItem(key, valueAfterRemoving)
        .catch((error) => OnyxUtils_1.default.evictStorageAndRetry(error, set, key, valueAfterRemoving))
        .then(() => {
        OnyxUtils_1.default.sendActionToDevTools(OnyxUtils_1.default.METHOD.SET, key, valueAfterRemoving);
        return updatePromise;
    });
}
/**
 * Sets multiple keys and values
 *
 * @example Onyx.multiSet({'key1': 'a', 'key2': 'b'});
 *
 * @param data object keyed by ONYXKEYS and the values to set
 */
function multiSet(data) {
    const keyValuePairs = OnyxUtils_1.default.prepareKeyValuePairsForStorage(data);
    const updatePromises = keyValuePairs.map(([key, value]) => {
        const prevValue = OnyxCache_1.default.getValue(key, false);
        // Update cache and optimistically inform subscribers on the next tick
        OnyxCache_1.default.set(key, value);
        return OnyxUtils_1.default.scheduleSubscriberUpdate(key, value, prevValue);
    });
    return storage_1.default.multiSet(keyValuePairs)
        .catch((error) => OnyxUtils_1.default.evictStorageAndRetry(error, multiSet, data))
        .then(() => {
        OnyxUtils_1.default.sendActionToDevTools(OnyxUtils_1.default.METHOD.MULTI_SET, undefined, data);
        return Promise.all(updatePromises);
    });
}
/**
 * Merge a new value into an existing value at a key.
 *
 * The types of values that can be merged are `Object` and `Array`. To set another type of value use `Onyx.set()`.
 * Values of type `Object` get merged with the old value, whilst for `Array`'s we simply replace the current value with the new one.
 *
 * Calls to `Onyx.merge()` are batched so that any calls performed in a single tick will stack in a queue and get
 * applied in the order they were called. Note: `Onyx.set()` calls do not work this way so use caution when mixing
 * `Onyx.merge()` and `Onyx.set()`.
 *
 * @example
 * Onyx.merge(ONYXKEYS.EMPLOYEE_LIST, ['Joe']); // -> ['Joe']
 * Onyx.merge(ONYXKEYS.EMPLOYEE_LIST, ['Jack']); // -> ['Joe', 'Jack']
 * Onyx.merge(ONYXKEYS.POLICY, {id: 1}); // -> {id: 1}
 * Onyx.merge(ONYXKEYS.POLICY, {name: 'My Workspace'}); // -> {id: 1, name: 'My Workspace'}
 */
function merge(key, changes) {
    const mergeQueue = OnyxUtils_1.default.getMergeQueue();
    const mergeQueuePromise = OnyxUtils_1.default.getMergeQueuePromise();
    // Top-level undefined values are ignored
    // Therefore we need to prevent adding them to the merge queue
    if (changes === undefined) {
        return mergeQueue[key] ? mergeQueuePromise[key] : Promise.resolve();
    }
    // Merge attempts are batched together. The delta should be applied after a single call to get() to prevent a race condition.
    // Using the initial value from storage in subsequent merge attempts will lead to an incorrect final merged value.
    if (mergeQueue[key]) {
        mergeQueue[key].push(changes);
        return mergeQueuePromise[key];
    }
    mergeQueue[key] = [changes];
    mergeQueuePromise[key] = OnyxUtils_1.default.get(key).then((existingValue) => {
        // Calls to Onyx.set after a merge will terminate the current merge process and clear the merge queue
        if (mergeQueue[key] == null) {
            return undefined;
        }
        try {
            // We first only merge the changes, so we can provide these to the native implementation (SQLite uses only delta changes in "JSON_PATCH" to merge)
            // We don't want to remove null values from the "batchedChanges", because SQLite uses them to remove keys from storage natively.
            let batchedChanges = OnyxUtils_1.default.applyMerge(undefined, mergeQueue[key], false);
            // The presence of a `null` in the merge queue instructs us to drop the existing value.
            // In this case, we can't simply merge the batched changes with the existing value, because then the null in the merge queue would have no effect
            const shouldOverwriteExistingValue = mergeQueue[key].includes(null);
            // Clean up the write queue, so we don't apply these changes again
            delete mergeQueue[key];
            delete mergeQueuePromise[key];
            // If the batched changes equal null, we want to remove the key from storage, to reduce storage size
            const { wasRemoved } = OnyxUtils_1.default.removeNullValues(key, batchedChanges);
            // After that we merge the batched changes with the existing value
            // We can remove null values from the "modifiedData", because "null" implicates that the user wants to remove a value from storage.
            // The "modifiedData" will be directly "set" in storage instead of being merged
            const modifiedData = shouldOverwriteExistingValue ? batchedChanges : OnyxUtils_1.default.applyMerge(existingValue, [batchedChanges], true);
            // On native platforms we use SQLite which utilises JSON_PATCH to merge changes.
            // JSON_PATCH generally removes null values from the stored object.
            // When there is no existing value though, SQLite will just insert the changes as a new value and thus the null values won't be removed.
            // Therefore we need to remove null values from the `batchedChanges` which are sent to the SQLite, if no existing value is present.
            if (!existingValue) {
                batchedChanges = OnyxUtils_1.default.applyMerge(undefined, [batchedChanges], true);
            }
            const hasChanged = OnyxCache_1.default.hasValueChanged(key, modifiedData);
            // Logging properties only since values could be sensitive things we don't want to log
            Logger.logInfo(`merge called for key: ${key}${underscore_1.default.isObject(batchedChanges) ? ` properties: ${underscore_1.default.keys(batchedChanges).join(',')}` : ''} hasChanged: ${hasChanged}`);
            // This approach prioritizes fast UI changes without waiting for data to be stored in device storage.
            const updatePromise = OnyxUtils_1.default.broadcastUpdate(key, modifiedData, hasChanged, wasRemoved);
            // If the value has not changed, calling Storage.setItem() would be redundant and a waste of performance, so return early instead.
            if (!hasChanged || wasRemoved) {
                return updatePromise;
            }
            return storage_1.default.mergeItem(key, batchedChanges, modifiedData).then(() => {
                OnyxUtils_1.default.sendActionToDevTools(OnyxUtils_1.default.METHOD.MERGE, key, changes, modifiedData);
                return updatePromise;
            });
        }
        catch (error) {
            Logger.logAlert(`An error occurred while applying merge for key: ${key}, Error: ${error}`);
            return Promise.resolve();
        }
    });
    return mergeQueuePromise[key];
}
/**
 * Merges a collection based on their keys
 *
 * @example
 *
 * Onyx.mergeCollection(ONYXKEYS.COLLECTION.REPORT, {
 *     [`${ONYXKEYS.COLLECTION.REPORT}1`]: report1,
 *     [`${ONYXKEYS.COLLECTION.REPORT}2`]: report2,
 * });
 *
 * @param collectionKey e.g. `ONYXKEYS.COLLECTION.REPORT`
 * @param collection Object collection keyed by individual collection member keys and values
 */
function mergeCollection(collectionKey, collection) {
    if (typeof collection !== 'object' || Array.isArray(collection) || utils_1.default.isEmptyObject(collection)) {
        Logger.logInfo('mergeCollection() called with invalid or empty value. Skipping this update.');
        return Promise.resolve();
    }
    const mergedCollection = collection;
    // Confirm all the collection keys belong to the same parent
    let hasCollectionKeyCheckFailed = false;
    Object.keys(mergedCollection).forEach((dataKey) => {
        if (OnyxUtils_1.default.isKeyMatch(collectionKey, dataKey)) {
            return;
        }
        if (process.env.NODE_ENV === 'development') {
            throw new Error(`Provided collection doesn't have all its data belonging to the same parent. CollectionKey: ${collectionKey}, DataKey: ${dataKey}`);
        }
        hasCollectionKeyCheckFailed = true;
        Logger.logAlert(`Provided collection doesn't have all its data belonging to the same parent. CollectionKey: ${collectionKey}, DataKey: ${dataKey}`);
    });
    // Gracefully handle bad mergeCollection updates so it doesn't block the merge queue
    if (hasCollectionKeyCheckFailed) {
        return Promise.resolve();
    }
    return OnyxUtils_1.default.getAllKeys().then((persistedKeys) => {
        // Split to keys that exist in storage and keys that don't
        const keys = Object.keys(mergedCollection).filter((key) => {
            if (mergedCollection[key] === null) {
                OnyxUtils_1.default.remove(key);
                return false;
            }
            return true;
        });
        const existingKeys = keys.filter((key) => persistedKeys.has(key));
        const newKeys = keys.filter((key) => !persistedKeys.has(key));
        const existingKeyCollection = existingKeys.reduce((obj, key) => {
            // eslint-disable-next-line no-param-reassign
            obj[key] = mergedCollection[key];
            return obj;
        }, {});
        const newCollection = newKeys.reduce((obj, key) => {
            // eslint-disable-next-line no-param-reassign
            obj[key] = mergedCollection[key];
            return obj;
        }, {});
        const keyValuePairsForExistingCollection = OnyxUtils_1.default.prepareKeyValuePairsForStorage(existingKeyCollection);
        const keyValuePairsForNewCollection = OnyxUtils_1.default.prepareKeyValuePairsForStorage(newCollection);
        const promises = [];
        // New keys will be added via multiSet while existing keys will be updated using multiMerge
        // This is because setting a key that doesn't exist yet with multiMerge will throw errors
        if (keyValuePairsForExistingCollection.length > 0) {
            promises.push(storage_1.default.multiMerge(keyValuePairsForExistingCollection));
        }
        if (keyValuePairsForNewCollection.length > 0) {
            promises.push(storage_1.default.multiSet(keyValuePairsForNewCollection));
        }
        // Prefill cache if necessary by calling get() on any existing keys and then merge original data to cache
        // and update all subscribers
        const promiseUpdate = Promise.all(existingKeys.map(OnyxUtils_1.default.get)).then(() => {
            OnyxCache_1.default.merge(mergedCollection);
            return OnyxUtils_1.default.scheduleNotifyCollectionSubscribers(collectionKey, mergedCollection);
        });
        return Promise.all(promises)
            .catch((error) => OnyxUtils_1.default.evictStorageAndRetry(error, mergeCollection, collectionKey, mergedCollection))
            .then(() => {
            OnyxUtils_1.default.sendActionToDevTools(OnyxUtils_1.default.METHOD.MERGE_COLLECTION, undefined, mergedCollection);
            return promiseUpdate;
        });
    });
}
/**
 * Clear out all the data in the store
 *
 * Note that calling Onyx.clear() and then Onyx.set() on a key with a default
 * key state may store an unexpected value in Storage.
 *
 * E.g.
 * Onyx.clear();
 * Onyx.set(ONYXKEYS.DEFAULT_KEY, 'default');
 * Storage.getItem(ONYXKEYS.DEFAULT_KEY)
 *     .then((storedValue) => console.log(storedValue));
 * null is logged instead of the expected 'default'
 *
 * Onyx.set() might call Storage.setItem() before Onyx.clear() calls
 * Storage.setItem(). Use Onyx.merge() instead if possible. Onyx.merge() calls
 * Onyx.get(key) before calling Storage.setItem() via Onyx.set().
 * Storage.setItem() from Onyx.clear() will have already finished and the merged
 * value will be saved to storage after the default value.
 *
 * @param keysToPreserve is a list of ONYXKEYS that should not be cleared with the rest of the data
 */
function clear(keysToPreserve = []) {
    return OnyxUtils_1.default.getAllKeys().then((keys) => {
        const keysToBeClearedFromStorage = [];
        const keyValuesToResetAsCollection = {};
        const keyValuesToResetIndividually = {};
        // The only keys that should not be cleared are:
        // 1. Anything specifically passed in keysToPreserve (because some keys like language preferences, offline
        //      status, or activeClients need to remain in Onyx even when signed out)
        // 2. Any keys with a default state (because they need to remain in Onyx as their default, and setting them
        //      to null would cause unknown behavior)
        keys.forEach((key) => {
            var _a;
            const isKeyToPreserve = keysToPreserve.includes(key);
            const defaultKeyStates = OnyxUtils_1.default.getDefaultKeyStates();
            const isDefaultKey = key in defaultKeyStates;
            // If the key is being removed or reset to default:
            // 1. Update it in the cache
            // 2. Figure out whether it is a collection key or not,
            //      since collection key subscribers need to be updated differently
            if (!isKeyToPreserve) {
                const oldValue = OnyxCache_1.default.getValue(key);
                const newValue = (_a = defaultKeyStates[key]) !== null && _a !== void 0 ? _a : null;
                if (newValue !== oldValue) {
                    OnyxCache_1.default.set(key, newValue);
                    const collectionKey = key.substring(0, key.indexOf('_') + 1);
                    if (collectionKey) {
                        if (!keyValuesToResetAsCollection[collectionKey]) {
                            keyValuesToResetAsCollection[collectionKey] = {};
                        }
                        keyValuesToResetAsCollection[collectionKey][key] = newValue;
                    }
                    else {
                        keyValuesToResetIndividually[key] = newValue;
                    }
                }
            }
            if (isKeyToPreserve || isDefaultKey) {
                return;
            }
            // If it isn't preserved and doesn't have a default, we'll remove it
            keysToBeClearedFromStorage.push(key);
        });
        const updatePromises = [];
        // Notify the subscribers for each key/value group so they can receive the new values
        Object.entries(keyValuesToResetIndividually).forEach(([key, value]) => {
            updatePromises.push(OnyxUtils_1.default.scheduleSubscriberUpdate(key, value, OnyxCache_1.default.getValue(key, false)));
        });
        Object.entries(keyValuesToResetAsCollection).forEach(([key, value]) => {
            updatePromises.push(OnyxUtils_1.default.scheduleNotifyCollectionSubscribers(key, value));
        });
        const defaultKeyStates = OnyxUtils_1.default.getDefaultKeyStates();
        const defaultKeyValuePairs = Object.entries(Object.keys(defaultKeyStates)
            .filter((key) => !keysToPreserve.includes(key))
            .reduce((obj, key) => {
            // eslint-disable-next-line no-param-reassign
            obj[key] = defaultKeyStates[key];
            return obj;
        }, {}));
        // Remove only the items that we want cleared from storage, and reset others to default
        keysToBeClearedFromStorage.forEach((key) => OnyxCache_1.default.drop(key));
        return storage_1.default.removeItems(keysToBeClearedFromStorage)
            .then(() => storage_1.default.multiSet(defaultKeyValuePairs))
            .then(() => {
            DevTools_1.default.clearState(keysToPreserve);
            return Promise.all(updatePromises);
        });
    });
}
/**
 * Insert API responses and lifecycle data into Onyx
 *
 * @param data An array of objects with shape {onyxMethod: oneOf('set', 'merge', 'mergeCollection', 'multiSet', 'clear'), key: string, value: *}
 * @returns resolves when all operations are complete
 */
function update(data) {
    // First, validate the Onyx object is in the format we expect
    data.forEach(({ onyxMethod, key, value }) => {
        if (![OnyxUtils_1.default.METHOD.CLEAR, OnyxUtils_1.default.METHOD.SET, OnyxUtils_1.default.METHOD.MERGE, OnyxUtils_1.default.METHOD.MERGE_COLLECTION, OnyxUtils_1.default.METHOD.MULTI_SET].includes(onyxMethod)) {
            throw new Error(`Invalid onyxMethod ${onyxMethod} in Onyx update.`);
        }
        if (onyxMethod === OnyxUtils_1.default.METHOD.MULTI_SET) {
            // For multiset, we just expect the value to be an object
            if (typeof value !== 'object' || Array.isArray(value) || typeof value === 'function') {
                throw new Error('Invalid value provided in Onyx multiSet. Onyx multiSet value must be of type object.');
            }
        }
        else if (onyxMethod !== OnyxUtils_1.default.METHOD.CLEAR && typeof key !== 'string') {
            throw new Error(`Invalid ${typeof key} key provided in Onyx update. Onyx key must be of type string.`);
        }
    });
    const promises = [];
    let clearPromise = Promise.resolve();
    data.forEach(({ onyxMethod, key, value }) => {
        switch (onyxMethod) {
            case OnyxUtils_1.default.METHOD.SET:
                promises.push(() => set(key, value));
                break;
            case OnyxUtils_1.default.METHOD.MERGE:
                promises.push(() => merge(key, value));
                break;
            case OnyxUtils_1.default.METHOD.MERGE_COLLECTION:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- We validated that the value is a collection
                promises.push(() => mergeCollection(key, value));
                break;
            case OnyxUtils_1.default.METHOD.MULTI_SET:
                promises.push(() => multiSet(value));
                break;
            case OnyxUtils_1.default.METHOD.CLEAR:
                clearPromise = clear();
                break;
            default:
                break;
        }
    });
    return clearPromise.then(() => Promise.all(promises.map((p) => p())));
}
const Onyx = {
    METHOD: OnyxUtils_1.default.METHOD,
    connect,
    disconnect,
    set,
    multiSet,
    merge,
    mergeCollection,
    update,
    clear,
    init,
    registerLogger: Logger.registerLogger,
};
exports.default = Onyx;
