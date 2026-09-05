<script lang="ts">
  // Script: `branch` scores 2 (if + else). Template: 1 + 2 + 1 = 4.
  let a = false;
  let b = false;
  let c = false;
  export function branch(v: boolean): number {
    if (v) {
      return 1;
    } else {
      return 2;
    }
  }
</script>

{#if a}
  {#if b}
    <i>ab</i>
  {/if}
{/if}
{#if c}
  <i>c</i>
{/if}
