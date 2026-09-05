<script lang="ts">
  // Known template complexity 2 (an {#if} with an {:else}): reported at templateThreshold 1 (R28).
  let a = false;
</script>

{#if a}
  <b>yes</b>
{:else}
  <b>no</b>
{/if}
