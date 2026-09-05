<script lang="ts">
  // The inline handler's `if` sits at nesting 1 (the function raises nesting) and scores
  // +2 into the template; the script function stays at 0 and no entry exists for the handler.
  let x = 0;
  export function plain(): number {
    return x;
  }
</script>

<button onclick={() => { if (x) { x = 0; } }}>reset</button>
