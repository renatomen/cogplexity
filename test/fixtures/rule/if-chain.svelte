<script lang="ts">
  // Template: ifBlock +1, elseIfBlock +1, elseBlock +1, eachBlock +2 (nesting 1) = 5.
  let a = false;
  let b = false;
  let xs: number[] = [];
</script>

{#if a}
  <p>a</p>
{:else if b}
  <p>b</p>
{:else}
  {#each xs as x}
    <span>{x}</span>
  {/each}
{/if}
