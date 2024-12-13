import { createDirectory, safeRemove } from '@platformatic/utils'
import { deepStrictEqual, ok } from 'node:assert'
import { existsSync } from 'node:fs'
import { appendFile, cp, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { test } from 'node:test'
import { pino } from 'pino'
import { prepareRuntime } from '../../basic/test/helper.js'
import { defaultServiceJson } from '../lib/defaults.js'
import { version } from '../lib/schema.js'
import { loadRawConfigurationFile, saveConfigurationFile, serviceToEnvVariable } from '../lib/utils.js'
import { createTemporaryDirectory, executeCommand, wattpm } from './helper.js'

const logger = pino()
const autodetect = {
  astro: 'astro',
  node: null,
  next: 'next',
  remix: '@remix-run/dev',
  vite: 'vite'
}

test('import - should import a URL', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  process.chdir(rootDir)
  await wattpm('import', 'http://github.com/foo/bar.git')

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id: 'bar',
        path: '{PLT_SERVICE_BAR_PATH}',
        url: 'http://github.com/foo/bar.git'
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo\nPLT_SERVICE_BAR_PATH=\n')
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), 'PLT_SERVICE_BAR_PATH=\n')
})

test('import - should import a GitHub repo via SSH', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  process.chdir(rootDir)
  await wattpm('import', rootDir, 'foo/bar', '-i', 'id')

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id: 'id',
        path: '{PLT_SERVICE_ID_PATH}',
        url: 'git@github.com:foo/bar.git'
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo\nPLT_SERVICE_ID_PATH=\n')
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), 'PLT_SERVICE_ID_PATH=\n')
})

test('import - should import a GitHub repo via HTTP', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  process.chdir(rootDir)
  await wattpm('import', rootDir, 'foo/bar', '-h', '-i', 'id')

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id: 'id',
        path: '{PLT_SERVICE_ID_PATH}',
        url: 'https://github.com/foo/bar.git'
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo\nPLT_SERVICE_ID_PATH=\n')
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), 'PLT_SERVICE_ID_PATH=\n')
})

test('import - should import a local folder with a Git remote', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  const directory = await createTemporaryDirectory(t, 'local-with-git')
  await executeCommand('git', 'init', { cwd: directory })
  await executeCommand('git', 'remote', 'add', 'origin', 'git@github.com:hello/world.git', { cwd: directory })
  const id = basename(directory)
  const envVariable = serviceToEnvVariable(id)

  process.chdir(rootDir)
  await wattpm('import', directory)

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id,
        path: `{${envVariable}}`,
        url: 'git@github.com:hello/world.git'
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), `RUNTIME_ENV=foo\n${envVariable}=${directory}\n`)
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), `${envVariable}=\n`)
})

test('import - should import a local folder without a Git remote', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  const directory = await createTemporaryDirectory(t, 'local-with-git')
  const id = basename(directory)
  const envVariable = serviceToEnvVariable(id)

  process.chdir(rootDir)
  const importProcess = await wattpm('import', directory)

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id,
        path: `{${envVariable}}`
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), `RUNTIME_ENV=foo\n${envVariable}=${directory}\n`)
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), `${envVariable}=\n`)

  ok(importProcess.stdout.includes(`The service ${id} does not define a Git repository.`))
})

test('import - should import a local folder within the repository without using environment variables or URLs', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  const id = 'in-a-repo'
  const path = join('this', 'is', 'in-a-repo') // This is for Windows compatibility
  const absolute = resolve(rootDir, path)
  await createDirectory(absolute)
  await executeCommand('git', 'init', { cwd: absolute })
  await executeCommand('git', 'remote', 'add', 'origin', 'git@github.com:hello/world.git', { cwd: absolute })

  process.chdir(rootDir)
  await wattpm('import', resolve(rootDir, path))

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id,
        path
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo')
  ok(!existsSync(resolve(rootDir, '.env.sample')))
})

test('import - should not do anything when the local folder is already an autoloaded service', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')

  const originalFileContents = await readFile(configurationFile, 'utf-8')

  process.chdir(rootDir)
  const importProcess = await wattpm('import', resolve(rootDir, 'web/main'))

  deepStrictEqual(await readFile(configurationFile, 'utf-8'), originalFileContents)
  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo')
  ok(!existsSync(resolve(rootDir, '.env.sample')))

  deepStrictEqual(importProcess.exitCode, 0)
  ok(importProcess.stdout.includes('The path is already autoloaded as a service.'))
})

test('import - should not do anything when the local folder is already a defined service', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')

  const contents = await loadRawConfigurationFile(logger, configurationFile)
  contents.web = [{ id: 'main', path: 'main' }]
  await saveConfigurationFile(logger, configurationFile, contents)
  await createDirectory(resolve(rootDir, 'main'))
  await cp(resolve(rootDir, 'web/main/watt.json'), resolve(rootDir, 'main/watt.json'))

  const originalFileContents = await readFile(configurationFile, 'utf-8')

  process.chdir(rootDir)
  const importProcess = await wattpm('import', 'main')

  deepStrictEqual(await readFile(configurationFile, 'utf-8'), originalFileContents)
  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo')
  ok(!existsSync(resolve(rootDir, '.env.sample')))

  deepStrictEqual(importProcess.exitCode, 0)
  ok(importProcess.stdout.includes('The path is already defined as a service.'))
})

test('import - should raise an error when importing if the service id is already taken', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await readFile(configurationFile, 'utf-8')

  process.chdir(rootDir)
  const importProcess = await wattpm('import', rootDir, 'foo/bar', '-i', 'main', { reject: false })

  deepStrictEqual(await readFile(configurationFile, 'utf-8'), originalFileContents)
  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'RUNTIME_ENV=foo')
  ok(!existsSync(resolve(rootDir, '.env.sample')))

  deepStrictEqual(importProcess.exitCode, 1)
  ok(importProcess.stdout.includes('There is already a service main defined, please choose a different service ID.'))
})

test('import - should raise an error when importing if the environment variable is already defined', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await readFile(configurationFile, 'utf-8')

  await appendFile(resolve(rootDir, '.env'), '\nPLT_SERVICE_BAR_PATH=foo\n')
  const originalEnv = await readFile(resolve(rootDir, '.env'), 'utf-8')

  process.chdir(rootDir)
  const importProcess = await wattpm('import', rootDir, 'foo/bar', { reject: false })

  deepStrictEqual(await readFile(configurationFile, 'utf-8'), originalFileContents)
  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), originalEnv)
  ok(!existsSync(resolve(rootDir, '.env.sample')))

  deepStrictEqual(importProcess.exitCode, 1)
  ok(
    importProcess.stdout.includes(
      'There is already an environment variable PLT_SERVICE_BAR_PATH defined, please choose a different service ID.'
    )
  )
})

test('import - should properly manage environment files', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  await cp(resolve(rootDir, '.env'), resolve(rootDir, '.env.sample'))
  await safeRemove(resolve(rootDir, '.env'))

  process.chdir(rootDir)
  await wattpm('import', 'http://github.com/foo/bar.git')

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id: 'bar',
        path: '{PLT_SERVICE_BAR_PATH}',
        url: 'http://github.com/foo/bar.git'
      }
    ]
  })

  // The .env has been created
  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), 'PLT_SERVICE_BAR_PATH=\n')

  // The .env.sample has been updated
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), 'RUNTIME_ENV=foo\nPLT_SERVICE_BAR_PATH=\n')
})

test('import - should not modify existing watt.json files when exporting local folders', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  const directory = await createTemporaryDirectory(t, 'local-with-git')
  await writeFile(resolve(directory, 'watt.json'), JSON.stringify({ foo: 'bar' }), 'utf-8')
  const id = basename(directory)
  const envVariable = serviceToEnvVariable(id)

  process.chdir(rootDir)
  await wattpm('import', directory)

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
    ...originalFileContents,
    web: [
      {
        id,
        path: `{${envVariable}}`
      }
    ]
  })

  deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), `RUNTIME_ENV=foo\n${envVariable}=${directory}\n`)
  deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), `${envVariable}=\n`)
  deepStrictEqual(await loadRawConfigurationFile(logger, resolve(directory, 'watt.json')), { foo: 'bar' })
})

for (const [name, dependency] of Object.entries(autodetect)) {
  test(`import - should correctly autodetect a @platformatic/${name} stackable when importing local folders`, async t => {
    const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
    t.after(() => safeRemove(rootDir))

    const configurationFile = resolve(rootDir, 'watt.json')
    const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

    const directory = await createTemporaryDirectory(t, 'local-with-git')
    if (dependency) {
      await writeFile(
        resolve(directory, 'package.json'),
        JSON.stringify({ dependencies: { [dependency]: '*' } }),
        'utf-8'
      )
    }

    const id = basename(directory)
    const envVariable = serviceToEnvVariable(id)

    process.chdir(rootDir)
    await wattpm('import', directory)

    deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), {
      ...originalFileContents,
      web: [
        {
          id,
          path: `{${envVariable}}`
        }
      ]
    })

    deepStrictEqual(await readFile(resolve(rootDir, '.env'), 'utf-8'), `RUNTIME_ENV=foo\n${envVariable}=${directory}\n`)
    deepStrictEqual(await readFile(resolve(rootDir, '.env.sample'), 'utf-8'), `${envVariable}=\n`)

    deepStrictEqual(await loadRawConfigurationFile(logger, resolve(directory, 'package.json')), {
      dependencies: {
        ...(dependency ? { [dependency]: '*' } : {}),
        [`@platformatic/${name}`]: `^${version}`
      }
    })

    deepStrictEqual(await loadRawConfigurationFile(logger, resolve(directory, 'watt.json')), {
      ...defaultServiceJson,
      $schema: `https://schemas.platformatic.dev/@platformatic/${name}/${version}.json`
    })
  })
}

test('import - when launched without arguments, should fix the configuration of all known services', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'no-dependencies', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  process.chdir(rootDir)
  await wattpm('import')

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), originalFileContents)

  for (const servicePath of ['web-1/first', 'web-1/second']) {
    deepStrictEqual(await loadRawConfigurationFile(logger, resolve(rootDir, servicePath, 'package.json')), {
      dependencies: {
        '@platformatic/node': `^${version}`
      }
    })

    deepStrictEqual(await loadRawConfigurationFile(logger, resolve(rootDir, servicePath, 'watt.json')), {
      ...defaultServiceJson,
      $schema: `https://schemas.platformatic.dev/@platformatic/node/${version}.json`
    })
  }

  deepStrictEqual(await loadRawConfigurationFile(logger, resolve(rootDir, 'web-2/third/watt.json')), { foo: 'bar' })
})

test('import - should find the nearest watt.json', async t => {
  const { root: rootDir } = await prepareRuntime(t, 'main', false, 'watt.json')
  t.after(() => safeRemove(rootDir))

  const configurationFile = resolve(rootDir, 'watt.json')
  const originalFileContents = await loadRawConfigurationFile(logger, configurationFile)

  const directory = resolve(rootDir, 'web/next')
  await createDirectory(directory)

  process.chdir(resolve(rootDir, 'web/next'))
  await wattpm('import', '.')

  deepStrictEqual(await loadRawConfigurationFile(logger, configurationFile), originalFileContents)

  ok(!existsSync(resolve(directory, 'web/next/package.json')))
  ok(!existsSync(resolve(directory, 'web/next/watt.json')))
})