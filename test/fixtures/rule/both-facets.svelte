<script lang="ts">
  // Both facets over the default threshold: `score16` scores 16 and the template scores 16.
  let a = false;
  export function score16(v: boolean): number {
    let n = 0;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    if (v) n++;
    return n;
  }
</script>

{#if a}1{/if}
{#if a}2{/if}
{#if a}3{/if}
{#if a}4{/if}
{#if a}5{/if}
{#if a}6{/if}
{#if a}7{/if}
{#if a}8{/if}
{#if a}9{/if}
{#if a}10{/if}
{#if a}11{/if}
{#if a}12{/if}
{#if a}13{/if}
{#if a}14{/if}
{#if a}15{/if}
{#if a}16{/if}
