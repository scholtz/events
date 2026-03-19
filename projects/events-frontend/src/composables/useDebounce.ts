import { ref, watch, type Ref } from 'vue'

/**
 * Returns a debounced copy of the given reactive ref.
 * The returned ref updates only after `delay` ms of inactivity.
 */
export function useDebouncedRef<T>(source: Ref<T>, delay = 300): Ref<T> {
  const debounced = ref<T>(source.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(source, (value) => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = value
    }, delay)
  })

  return debounced
}
