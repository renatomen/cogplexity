<script lang="ts">
  // Template: {#key} is transparent (ifBlock +1 at nesting 0); {#snippet} raises nesting
  // (ifBlock +2, and in the {@const} a run +1 plus a ternary +2) = 6.
  let x = 0;
  let a = false;
  let b = false;
</script>

{#key x}
  {#if x}
    <i>k</i>
  {/if}
{/key}

{#snippet row(v: boolean)}
  {@const label = a || b ? "y" : "n"}
  {#if v}
    <i>{label}</i>
  {/if}
{/snippet}

{@render row(true)}
