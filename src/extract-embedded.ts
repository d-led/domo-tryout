/**
 * Extracts embedded code sections marked with // embed-begin and // embed-end markers.
 * Processes imports to keep only domo-actors imports and replace others with //...
 */
export function extractEmbedded(code: string): string {
  const beginMarker = '// embed-begin'
  const endMarker = '// embed-end'
  const beginIdx = code.indexOf(beginMarker)
  const endIdx = code.indexOf(endMarker)
  
  if (beginIdx === -1 || endIdx === -1) {
    return code // Return full code if markers not found
  }
  
  // Extract the embedded section
  const embedded = code.substring(beginIdx + beginMarker.length, endIdx).trim()
  
  // Process imports: keep only domo-actors imports, replace others with //...
  const lines = code.substring(0, beginIdx).split('\n')
  const domoImports = lines.filter(line => line.includes('domo-actors'))
  const otherImports = lines.filter(line => 
    line.trim().startsWith('import') && !line.includes('domo-actors')
  )
  
  let result = domoImports.join('\n')
  if (otherImports.length > 0) {
    result += '\n//...\n'
  }
  result += '\n' + embedded
  
  return result
}

