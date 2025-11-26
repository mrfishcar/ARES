# Publishing an existing branch

When a feature branch already exists on GitHub, but the local clone reports no remotes or cannot push, use the following to reconnect and publish.

1. Add the remote (replace with your Git URL):
   ```bash
   git remote add origin https://github.com/mrfishcar/ARES.git
   ```

2. Confirm the branch exists on GitHub (replace with your branch name):
   ```bash
   git ls-remote --heads https://github.com/mrfishcar/ARES.git feature/magical-minimal-ui
   ```
   If the command prints a single line with the branch name, it exists. An empty result means it has not been pushed yet.

3. Fetch branch refs and check out the target branch (for example `feature/magical-minimal-ui`):
   ```bash
   git fetch origin
   git checkout feature/magical-minimal-ui
   ```

4. If the branch is new locally but already on GitHub, set the upstream before pushing:
   ```bash
   git branch --set-upstream-to=origin/feature/magical-minimal-ui
   ```

5. Push your commits:
   ```bash
   git push
   ```

If the branch does not yet exist on GitHub, create it locally, then push with upstream tracking in one step:
```bash
git checkout -b feature/magical-minimal-ui
git push -u origin feature/magical-minimal-ui
```

These commands avoid duplicate branch creation errors and ensure pushes go to the expected remote branch.
