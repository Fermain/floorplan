<script lang="ts">
  const experiments = [
    {
      href: '?exp=ortho',
      title: 'Elevation lock',
      steps: [
        'Drag to orbit the wall.',
        'Switch to Elevation. The camera should face the wall flat-on, and dragging should stop orbiting.',
        'Click the wall.',
      ],
      expected: [
        'The bar shows u and v in metres. u is distance from the left end. v is height above the base.',
        'A blue window, 0.90 m wide and 1.20 m tall, appears with its sill on the height you clicked.',
        'Switching back to Perspective restores orbit. The window stays.',
      ],
    },
    {
      href: '?exp=terrain',
      title: 'Terrain drape',
      steps: ['Drag to look along the bottom of the wall.'],
      expected: [
        'The ground rises toward the far corner, by about 2 m.',
        'The wall is two leaves. Its base follows the slope: no gap along the bottom, and the base is not a straight line between the two ends.',
        'The top of the wall stays level.',
      ],
    },
    {
      href: '?exp=csg',
      title: 'Window punch',
      steps: ['Drag to see the face, then the edge.'],
      expected: [
        'One wall, 3.96 m long and 11 courses high, with ten openings.',
        'Each opening is 0.28 m wide and 1.20 m tall, the sill is at 0.90 m, and you can see through it.',
        'From the side the wall is thick: two leaves and a cavity.',
        'This is the boolean punch, kept because it is too slow to run while editing.',
      ],
    },
  ]
</script>

<main>
  <header>
    <h1>Floorplan</h1>
    <p>Three spikes. Open one and check it against what it should show.</p>
    <p><a class="editor" href="/">Open the editor</a></p>
  </header>
  <ul>
    {#each experiments as experiment (experiment.href)}
      <li>
        <h2>{experiment.title}</h2>
        <a href={experiment.href}>Open</a>
        <h3>Do this</h3>
        <ol>
          {#each experiment.steps as step (step)}
            <li>{step}</li>
          {/each}
        </ol>
        <h3>Expected</h3>
        <ul>
          {#each experiment.expected as line (line)}
            <li>{line}</li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
</main>

<style>
  main {
    box-sizing: border-box;
    max-width: 40rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 3rem;
    font: 0.9375rem/1.45 system-ui, sans-serif;
    color: #18181b;
  }

  header p {
    margin: 0.35rem 0 0;
    color: #3f3f46;
  }

  a.editor {
    display: inline-block;
    margin-top: 0.75rem;
    padding: 0.35rem 0.7rem;
    border-radius: 4px;
    background: #18181b;
    color: #fff;
    text-decoration: none;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  ul {
    list-style: none;
    margin: 1.5rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  main > ul > li {
    margin: 0;
    padding: 1rem 1.1rem 1.1rem;
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 6px;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  h3 {
    margin: 0.9rem 0 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #71717a;
  }

  ol,
  li ul {
    margin: 0.15rem 0 0;
    padding-left: 1.15rem;
  }

  ol li,
  li ul li {
    margin: 0.2rem 0;
  }

  li ul {
    list-style: disc;
  }

  a {
    display: inline-block;
    margin-top: 0.65rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid #d4d4d8;
    border-radius: 4px;
    color: inherit;
    text-decoration: none;
  }

  a:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }
</style>
