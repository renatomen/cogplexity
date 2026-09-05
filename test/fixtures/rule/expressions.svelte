<script lang="ts">
  // Expression logic in markup, scored per KTD3 at the template nesting:
  // mustache 2, class directive 2, each 1 + key 2, render argument 1, inside {#if} 1 + 3 = 12.
  let a = false;
  let b = false;
  let c = false;
  let x = "x";
  let y = "y";
  let xs: string[] = [];
</script>

{a && b ? x : y}
<p class:active={a && b ? x : y}>p</p>
{#each xs as item (a && b ? x : y)}
  <span>{item}</span>
{/each}
{#snippet row(v: string)}
  <b>{v}</b>
{/snippet}
{@render row(a ? x : y)}
{#if c}
  {a && b ? x : y}
{/if}
