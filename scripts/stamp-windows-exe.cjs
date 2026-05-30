const { readFileSync, renameSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const { NtExecutable, NtExecutableResource } = require('pe-library')
const { Data, Resource } = require('resedit')

const root = path.resolve(__dirname, '..')
const { version } = require(path.join(root, 'package.json'))
const executable = path.join(root, 'dist', 'win-unpacked', 'Reaction Clipboard.exe')
const icon = path.join(root, 'build', 'icon.ico')
const temporaryExecutable = `${executable}.tmp`
const pe = NtExecutable.from(readFileSync(executable))
const resources = NtExecutableResource.from(pe)
const iconGroup = Resource.IconGroupEntry.fromEntries(resources.entries)[0]
const iconFile = Data.IconFile.from(readFileSync(icon))
Resource.IconGroupEntry.replaceIconsForResource(resources.entries, iconGroup?.id ?? 1, iconGroup?.lang ?? 1033, iconFile.icons.map((entry) => entry.data))

const versionInfo = Resource.VersionInfo.fromEntries(resources.entries)[0]
const language = versionInfo.getAllLanguagesForStringValues()[0] ?? { lang: 1033, codepage: 1200 }
versionInfo.setFileVersion(version, language.lang)
versionInfo.setProductVersion(version, language.lang)
versionInfo.setStringValues(language, {
  FileDescription: 'Reaction Clipboard',
  ProductName: 'Reaction Clipboard',
  CompanyName: 'Reaction Clipboard',
  OriginalFilename: ''
})
versionInfo.outputToResourceEntries(resources.entries)
resources.outputResource(pe)
writeFileSync(temporaryExecutable, Buffer.from(pe.generate()))
renameSync(temporaryExecutable, executable)
