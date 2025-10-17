function printLogo(pkg) {
console.log(`
   █████████                    █████      ███████████  █████████ 
  ███░░░░░███                  ░░███      ░░███░░░░░░█ ███░░░░░███
 ███     ░░░   ██████    █████  ░███ █████ ░███   █ ░ ░███    ░░░ 
░███          ░░░░░███  ███░░   ░███░░███  ░███████   ░░█████████ 
░███           ███████ ░░█████  ░██████░   ░███░░░█    ░░░░░░░░███
░░███     ███ ███░░███  ░░░░███ ░███░░███  ░███  ░     ███    ░███
 ░░█████████ ░░████████ ██████  ████ █████ █████      ░░█████████ 
  ░░░░░░░░░   ░░░░░░░░ ░░░░░░  ░░░░ ░░░░░ ░░░░░        ░░░░░░░░░  
                                                                  
A modern data management system for linked data.
Built by The University of California, UC Davis Library.

Version: ${pkg.version}

cask --help for command line usage`);
}
export default printLogo;