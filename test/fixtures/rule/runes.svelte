<script module lang="ts">
  // A module-script function is a root entry scored like a .ts function (KTD3): score 1.
  export function helper(a: boolean): number {
    if (a) {
      return 1;
    }
    return 0;
  }
</script>

<script lang="ts">
  // Svelte 5 runes are ordinary calls; the $effect callback is a root function scoring 1.
  let count = $state(0);
  const doubled = $derived(count * 2);
  $effect(() => {
    if (count > 10) {
      console.log(doubled);
    }
  });
</script>

<button onclick={() => count++}>{count}</button>
