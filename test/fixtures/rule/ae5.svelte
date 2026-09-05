<script lang="ts">
  // AE5: one script function scoring 20 (twenty sequential ifs) and a template scoring 3.
  let items: string[] = [];
  export function score20(a: boolean): number {
    let n = 0;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    if (a) n++;
    return n;
  }
</script>

{#if items.length > 0}
  <ul>
    {#each items as item}
      <li>{item}</li>
    {/each}
  </ul>
{/if}
