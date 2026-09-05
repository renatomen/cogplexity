<script lang="ts">
  // Template: awaitBlock +1, thenBlock +1, ifBlock +2 (nesting 1), catchBlock +1 = 5.
  let p: Promise<boolean> = Promise.resolve(true);
</script>

{#await p}
  <p>loading</p>
{:then v}
  {#if v}
    <b>yes</b>
  {/if}
{:catch e}
  <p>{e}</p>
{/await}
