import { ref, watch } from 'vue';
/**
 * Returns a debounced copy of the given reactive ref.
 * The returned ref updates only after `delay` ms of inactivity.
 */
export function useDebouncedRef(source, delay = 300) {
    const debounced = ref(source.value);
    let timer;
    watch(source, (value) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            debounced.value = value;
        }, delay);
    });
    return debounced;
}
